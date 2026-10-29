import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as prompt from "../src/lib/prompt.ts";

// Loads a server module with its framework imports replaced by stubs.
function load(file, stubs) {
  const source = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Error, Buffer, AbortController, setTimeout, clearTimeout, AbortSignal, JSON, Math, Promise, String, performance, console: stubs.console ?? console, process: stubs.process ?? process,
    fetch: stubs.fetch,
    require(name) {
      if (name === "@/lib/prompt") return prompt;
      if (name in stubs.modules) return stubs.modules[name];
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return exports;
}
function captioner(replies) {
  const calls = [];
  const mod = load("captioner.ts", {
    modules: { "server-only": {} },
    process: { env: { OPENAI_API_KEY: "test-openai-key" } },
    async fetch(url, init) {
      calls.push({ ...init, url });
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return new Response(next.body, { status: next.status });
    },
  });
  return { mod, calls };
}
const reply = (captions) =>
  JSON.stringify({ id: "gen-1", choices: [{ message: { content: JSON.stringify({ details: [], drafts: [], captions }) } }] });

test("a successful call records one attempt with the raw reply, status and timing", async () => {
  const body = reply([" one ", "two", "three", "four"]);
  const { mod } = captioner([{ status: 200, body }]);
  const attempts = [];
  const captions = await mod.captionPhoto(new Uint8Array([1]), "image/png", "p", attempts);
  assert.deepEqual(captions, ["one", "two", "three"]);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].outcome, "succeeded");
  assert.equal(attempts[0].httpStatus, 200);
  assert.equal(attempts[0].body, body);
  assert.equal(attempts[0].error, null);
  assert.ok(attempts[0].ms >= 0);
});
test("a provider 5xx is retried once and both calls are recorded", async () => {
  const { mod, calls } = captioner([{ status: 503, body: "busy" }, { status: 200, body: reply(["a"]) }]);
  const attempts = [];
  await mod.captionPhoto(new Uint8Array([1]), "image/png", "p", attempts);
  assert.equal(calls.length, 2);
  assert.deepEqual(attempts.map((a) => [a.attempt, a.outcome, a.httpStatus]), [[1, "failed", 503], [2, "succeeded", 200]]);
  assert.match(attempts[0].error, /503.*retried/);
  assert.equal(attempts[0].body, "busy");
});
test("paused, failed, unparsable and empty replies throw as before and are recorded as failed", async () => {
  for (const [status, body, expected] of [
    [429, "rate limited", /OpenAI unavailable \(429\)/],
    [400, "bad request", /request failed \(400\)/],
    [200, "not json", /SyntaxError/],
  ]) {
    const { mod } = captioner([{ status, body }]);
    const attempts = [];
    await assert.rejects(mod.captionPhoto(new Uint8Array([1]), "image/png", "p", attempts));
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].outcome, "failed");
    assert.equal(attempts[0].body, body);
    assert.match(attempts[0].error, expected);
  }
  const empty = captioner([{ status: 200, body: reply(["  "]) }]);
  const emptyAttempts = [];
  assert.deepEqual(await empty.mod.captionPhoto(new Uint8Array([1]), "image/png", "p", emptyAttempts), []);
  assert.equal(emptyAttempts[0].outcome, "failed");
  assert.match(emptyAttempts[0].error, /no usable captions/);
  const { mod } = captioner([{ status: 402, body: "" }]);
  await assert.rejects(mod.captionPhoto(new Uint8Array([1]), "image/png", "p", []), (e) => e instanceof mod.CaptionsPaused);
});
test("a network failure or timeout is recorded with no status or body and is not retried", async () => {
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  const { mod, calls } = captioner([timeout]);
  const attempts = [];
  await assert.rejects(mod.captionPhoto(new Uint8Array([1]), "image/png", "p", attempts), /timeout/);
  assert.equal(calls.length, 1);
  assert.deepEqual([attempts[0].httpStatus, attempts[0].body, attempts[0].outcome], [null, null, "failed"]);
  assert.equal(attempts[0].error, "TimeoutError: The operation was aborted due to timeout");
});
test("the direct OpenAI request uses Luna, server credentials and supported bounded parameters", async () => {
  const { mod, calls } = captioner([{ status: 200, body: reply(["a"]) }]);
  await mod.captionPhoto(new Uint8Array([9]), "image/png", "the prompt", []);
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.model, "gpt-6-luna");
  assert.equal(sent.max_completion_tokens, 2500);
  assert.equal(sent.reasoning_effort, "low");
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.equal(sent.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(sent.messages[0].content[1].text, "the prompt");
  assert.equal(sent.messages[0].content[0].image_url.url, "data:image/png;base64,CQ==");
  assert.equal(calls[0].headers.authorization, "Bearer test-openai-key");
});

function fakeDb({ stepTemplate = prompt.PROMPT_TEMPLATE, insertError = null, insertThrows = false, hang = "" } = {}) {
  const inserted = [];
  const signals = [];
  // A request that never answers until it is aborted.
  const stall = (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const db = {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        limit() { return chain; },
        abortSignal(signal) { signals.push(signal); chain.signal = signal; return chain; },
        then(resolve, reject) { return chain.read().then(resolve, reject); },
        async read() {
          if (hang === "lookup") return stall(chain.signal);
          if (table === "prompt_chain_steps") return { data: [{ id: 7, user_prompt_template: stepTemplate }], error: null };
          if (table === "llm_models") return { data: [{ id: 3 }], error: null };
          throw new Error(`unexpected read ${table}`);
        },
        insert(rows) {
          assert.equal(table, "llm_responses", "only llm_responses is written");
          return {
            abortSignal(signal) {
              signals.push(signal);
              if (hang === "insert") return stall(signal);
              if (insertThrows) return Promise.reject(new Error("network down"));
              if (!insertError) inserted.push(...rows);
              return Promise.resolve({ error: insertError });
            },
          };
        },
      };
      return chain;
    },
  };
  return { db, inserted, signals };
}
function modelLog(env = {}) {
  const errors = [];
  const mod = load("model-log.ts", {
    modules: { "server-only": {}, "@supabase/supabase-js": { createClient() { throw new Error("no real client in tests"); } } },
    console: { error: (...args) => errors.push(args.join(" ")), warn: (...args) => errors.push(args.join(" ")) },
    process: { env },
  });
  return { mod, errors };
}
const attempt = (over = {}) => ({ attempt: 1, outcome: "succeeded", httpStatus: 200, body: "{}", error: null, ms: 1234, ...over });

test("each attempt becomes one row linked to the request, the matching step and the model", async () => {
  const { mod } = modelLog();
  const { db, inserted } = fakeDb();
  const ok = await mod.recordModelAttempts("gen-id", [attempt({ attempt: 1, outcome: "failed", httpStatus: 503, body: "busy", error: "retried" }), attempt({ attempt: 2 })], db);
  assert.equal(ok, true);
  assert.equal(inserted.length, 2);
  assert.deepEqual(
    inserted.map((r) => [r.generation_id, r.attempt, r.outcome, r.http_status, r.prompt_chain_step_id, r.llm_model_id, r.processing_ms]),
    [["gen-id", 1, "failed", 503, 7, 3, 1234], ["gen-id", 2, "succeeded", 200, 7, 3, 1234]],
  );
  assert.equal(inserted[0].prompt_template_sha256, prompt.PROMPT_TEMPLATE_SHA256);
  assert.equal(inserted[0].model_identifier, "gpt-6-luna");
});
test("a stored step whose template differs from the one that ran is not linked", async () => {
  const { mod } = modelLog();
  const { db, inserted } = fakeDb({ stepTemplate: "Abbreviated prompt" });
  await mod.recordModelAttempts("gen-id", [attempt()], db);
  assert.equal(inserted[0].prompt_chain_step_id, null);
  assert.equal(inserted[0].llm_model_id, 3);
});
test("token-shaped text and inline image data are removed and long replies are truncated and flagged", () => {
  const { mod } = modelLog();
  const body = `{"error":"Bearer abc.def-ghi rejected","echo":"data:image/png;base64,iVBORw0KGgo="}` + "x".repeat(70_000);
  const [row] = mod.responseRows("g", [attempt({ body, error: "Bearer abc.def leaked" })], { stepId: null, modelId: null });
  assert.equal(row.response_body.includes("abc.def"), false);
  assert.equal(row.response_body.includes("iVBOR"), false);
  assert.equal(row.response_body.length, 60_000);
  assert.equal(row.response_truncated, true);
  assert.equal(row.error_message, "Bearer [removed] leaked");
});
test("credentials in any case or field shape are removed from stored bodies, errors and server logs", async () => {
  const { mod, errors } = modelLog();
  const secrets = ["abc.DEF-ghi_123", "sk-proj-AbCdEf123456", "vck_1234567890abcdef", "eyJhbGciOiJIUzI1.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJlLXZhbHVl", "k3y-value-999"];
  const body = JSON.stringify({
    error: { message: `bearer ${secrets[0]} was rejected; key ${secrets[1]} / ${secrets[2]}` },
    headers: { Authorization: `BEARER ${secrets[0]}`, "x-api-key": secrets[4] },
    api_key: secrets[4], apiKey: secrets[4], access_token: secrets[3],
  }) + `\nauthorization: Bearer ${secrets[0]}\nAPI-KEY=${secrets[4]}`;
  const [row] = mod.responseRows("g", [attempt({ body, error: `Authorization: Bearer ${secrets[0]}` })], { stepId: null, modelId: null });
  for (const secret of secrets) {
    assert.equal(row.response_body.includes(secret), false, `body leaks ${secret}`);
    assert.equal(row.error_message.includes(secret), false, `error leaks ${secret}`);
  }
  assert.match(row.response_body, /was rejected/, "the diagnostic text survives");
  await mod.recordModelAttempts("g", [attempt()], fakeDb({ insertError: { message: `JWT ${secrets[3]} expired for apikey=${secrets[4]}` } }).db);
  for (const secret of secrets) assert.equal(errors.join("\n").includes(secret), false, `server log leaks ${secret}`);
});
test("logging failures are reported and never thrown", async () => {
  const missing = modelLog({});
  assert.equal(await missing.mod.recordModelAttempts("gen-id", [attempt()]), false);
  assert.match(missing.errors[0], /Not recorded for generation gen-id: SUPABASE_SERVICE_ROLE_KEY is not set/);
  const rejected = modelLog();
  assert.equal(await rejected.mod.recordModelAttempts("gen-id", [attempt()], fakeDb({ insertError: { message: "permission denied" } }).db), false);
  assert.match(rejected.errors[0], /permission denied/);
  const thrown = modelLog();
  assert.equal(await thrown.mod.recordModelAttempts("gen-id", [attempt()], fakeDb({ insertThrows: true }).db), false);
  assert.match(thrown.errors[0], /network down/);
});
test("a stalled lookup or insert gives up at the deadline, aborts the requests and reports it", async () => {
  for (const hang of ["lookup", "insert"]) {
    const { mod, errors } = modelLog();
    const { db, inserted, signals } = fakeDb({ hang });
    const started = Date.now();
    assert.equal(await mod.recordModelAttempts("gen-id", [attempt()], db, 50), false);
    assert.ok(Date.now() - started < 1000, `${hang} must not hold up the caption flow`);
    assert.equal(inserted.length, 0);
    assert.ok(signals.length && signals.every((signal) => signal.aborted), "every request is aborted");
    assert.match(errors[0], /Not confirmed for generation gen-id: gave up after 50 ms/);
  }
});
test("the logging module is marked server-only", () => {
  assert.match(readFileSync(new URL("../src/lib/model-log.ts", import.meta.url), "utf8"), /^import "server-only";/m);
});
test("the caption-failure server log scrubs the error before printing it", () => {
  const source = readFileSync(new URL("../src/app/create/actions.ts", import.meta.url), "utf8");
  const logged = source.match(/console\.error\([^;]*\);/g) ?? [];
  assert.ok(logged.length > 0);
  for (const line of logged) assert.match(line, /scrub\(/, `unscrubbed log: ${line}`);
  // A JSON.parse failure can quote the start of the reply, as in this message shape.
  const { mod } = modelLog();
  const message = `Unexpected token 'B', "Bearer abc.def-123 key=sk-proj-AbCdEf123456" is not valid JSON`;
  assert.doesNotMatch(mod.scrub(message), /AbCdEf123456|abc\.def-123/);
});

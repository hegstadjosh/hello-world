import "server-only";

import { CAPTION_MODEL } from "@/lib/prompt";

export { buildPrompt, CAPTION_MODEL, PROMPT_TEMPLATE, PROMPT_TEMPLATE_SHA256 } from "@/lib/prompt";

// Thrown when the provider is out of credit or rate-limiting us, so the app
// can say captions are paused rather than asking for a retry.
export class CaptionsPaused extends Error {}

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    details: { type: "array", items: { type: "string" } },
    drafts: { type: "array", items: { type: "string" } },
    captions: { type: "array", items: { type: "string" } },
  },
  required: ["details", "drafts", "captions"],
};

async function askOpenAI(image: Uint8Array, contentType: string, prompt: string) {
  const token = process.env.OPENAI_API_KEY;
  if (!token) throw new Error("No OpenAI credentials are available.");
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model: CAPTION_MODEL,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: `data:${contentType};base64,${Buffer.from(image).toString("base64")}` } },
        { type: "text", text: prompt },
      ] }],
      response_format: { type: "json_schema", json_schema: { name: "captions", strict: true, schema } },
      // Reasoning tokens count toward this cap; low effort leaves room for the drafts.
      max_completion_tokens: 2500,
      reasoning_effort: "low",
    }),
  });
}

// Request settings sent with every call; the admin app shows a copy of these.
export const CAPTION_REQUEST = { max_completion_tokens: 2500, reasoning_effort: "low", timeout_ms: 40_000, retries: "once on HTTP 5xx" };

// One provider call as it happened, for the admin app's LLM responses screen.
export type ModelAttempt = {
  attempt: number;
  outcome: "succeeded" | "failed";
  httpStatus: number | null;
  body: string | null;
  error: string | null;
  ms: number;
};

async function callOnce(image: Uint8Array, contentType: string, prompt: string, attempts: ModelAttempt[]) {
  const record: ModelAttempt = { attempt: attempts.length + 1, outcome: "failed", httpStatus: null, body: null, error: null, ms: 0 };
  attempts.push(record);
  const started = performance.now();
  try {
    const response = await askOpenAI(image, contentType, prompt);
    record.httpStatus = response.status;
    record.body = await response.text();
    return { response, body: record.body, record };
  } catch (error) {
    record.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw error;
  } finally {
    record.ms = Math.round(performance.now() - started);
  }
}

// One model call with a hard timeout, retried once if the provider errors;
// returns up to three cleaned captions. Every call is appended to `attempts`.
export async function captionPhoto(
  image: Uint8Array,
  contentType: string,
  prompt: string,
  attempts: ModelAttempt[] = [],
): Promise<string[]> {
  let { response, body, record } = await callOnce(image, contentType, prompt, attempts);
  if (response.status >= 500) {
    record.error = `OpenAI request failed (${response.status}); retried.`;
    ({ response, body, record } = await callOnce(image, contentType, prompt, attempts));
  }
  try {
    if (response.status === 402 || response.status === 429) throw new CaptionsPaused(`OpenAI unavailable (${response.status}).`);
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
    const data = JSON.parse(body);
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    const json = text?.replace(/^```(?:json)?\s*|\s*```$/g, "");
    const captions: unknown = json ? JSON.parse(json)?.captions : null;
    if (!Array.isArray(captions)) throw new Error("No captions came back.");
    const cleaned = captions
      .filter((caption): caption is string => typeof caption === "string")
      .map((caption) => caption.trim().slice(0, 280))
      .filter(Boolean)
      .slice(0, 3);
    // An empty list is returned as before; the caller tells the poster to try another photo.
    if (cleaned.length) record.outcome = "succeeded";
    else record.error = "The reply contained no usable captions.";
    return cleaned;
  } catch (error) {
    record.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw error;
  }
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ModelAttempt } from "@/lib/captioner";
import { CAPTION_MODEL, PROMPT_TEMPLATE, PROMPT_TEMPLATE_SHA256 } from "@/lib/prompt";

// Records each caption model call in llm_responses so the admin app can show
// the raw reply. Browser roles cannot touch that table, so this runs on the
// server with the service-role key and writes only llm_responses rows (after
// looking up the matching chain step and model). It never throws: a logging
// failure is reported in the server log and leaves the caption flow unchanged.
// The whole attempt (lookups and insert) has a deadline, so a slow database
// cannot hold up publishing the captions or cleaning up after a failure.

const MAX_BODY = 60_000;
export const LOG_DEADLINE_MS = 3_000;

// Provider replies do not echo the request, but an error body could, so
// anything shaped like a credential or inline image data is removed before it
// is stored or logged: Authorization/Bearer values, API-key fields and headers,
// common secret-key prefixes and JWT-shaped tokens (all case-insensitive).
export function scrub(text: string) {
  return text
    .replace(/(authorization["']?\s*[:=]\s*["']?)[^"'\s,}]+(\s+[^"'\s,}]+)?/gi, "$1[removed]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [removed]")
    .replace(
      /(["']?(?:x-)?(?:api[-_]?key|apikey|access[-_]?token|secret|client[-_]?secret|token)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi,
      "$1[removed]",
    )
    .replace(/\b(?:sk|pk|rk|vck|sb_secret|sb_publishable)[-_][A-Za-z0-9_-]{8,}/gi, "[removed]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[removed]")
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[inline data removed]");
}

const note = (error: unknown) => scrub(error instanceof Error ? error.message : String(error));

export function responseRows(
  generationId: string,
  attempts: ModelAttempt[],
  link: { stepId: number | null; modelId: number | null },
) {
  return attempts.map((attempt) => {
    const body = attempt.body === null ? null : scrub(attempt.body);
    return {
      generation_id: generationId,
      prompt_chain_step_id: link.stepId,
      llm_model_id: link.modelId,
      model_identifier: CAPTION_MODEL,
      attempt: attempt.attempt,
      outcome: attempt.outcome,
      http_status: attempt.httpStatus,
      response_body: body === null ? null : body.slice(0, MAX_BODY),
      response_truncated: body !== null && body.length > MAX_BODY,
      error_message: attempt.error ? scrub(attempt.error).slice(0, 1000) : null,
      processing_ms: attempt.ms,
      prompt_template_sha256: PROMPT_TEMPLATE_SHA256,
    };
  });
}

type Db = SupabaseClient;

// The chain step is linked only when its stored template is exactly the one
// this deployment sent; otherwise the reply is kept unlinked rather than
// attributed to a prompt that did not run.
async function findLink(db: Db, signal: AbortSignal) {
  const [steps, models] = await Promise.all([
    db
      .from("prompt_chain_steps")
      .select("id,user_prompt_template,prompt_chains!inner(slug)")
      .eq("prompt_chains.slug", "campus-captions")
      .eq("step_order", 1)
      .limit(1)
      .abortSignal(signal),
    db.from("llm_models").select("id").eq("provider_model_id", CAPTION_MODEL).limit(1).abortSignal(signal),
  ]);
  const step = (steps.data as { id: number; user_prompt_template: string }[] | null)?.[0];
  return {
    stepId: step && step.user_prompt_template === PROMPT_TEMPLATE ? step.id : null,
    modelId: (models.data as { id: number }[] | null)?.[0]?.id ?? null,
  };
}

class Deadline extends Error {}

export async function recordModelAttempts(
  generationId: string,
  attempts: ModelAttempt[],
  db?: Db,
  deadlineMs = LOG_DEADLINE_MS,
): Promise<boolean> {
  if (!attempts.length) return true;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!db && !key) {
    console.error(`[llm_responses] Not recorded for generation ${generationId}: SUPABASE_SERVICE_ROLE_KEY is not set.`);
    return false;
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Deadline());
    }, deadlineMs);
  });
  const write = async () => {
    const client = db ?? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!, { auth: { persistSession: false } });
    const link = await findLink(client, controller.signal);
    return client
      .from("llm_responses")
      .insert(responseRows(generationId, attempts, link))
      .abortSignal(controller.signal);
  };
  try {
    const { error } = await Promise.race([write(), deadline]);
    if (error) {
      console.error(`[llm_responses] Not recorded for generation ${generationId}: ${note(error.message)}`);
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof Deadline) {
      // The insert was aborted; it may not have reached the database.
      console.warn(`[llm_responses] Not confirmed for generation ${generationId}: gave up after ${deadlineMs} ms.`);
      return false;
    }
    console.error(`[llm_responses] Not recorded for generation ${generationId}: ${note(error)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

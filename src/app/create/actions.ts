"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildPrompt, CAPTION_MODEL, CaptionsPaused, captionPhoto } from "@/lib/captioner";
import { detectImage } from "@/lib/images";
import { todaysTheme } from "@/lib/themes";

export type CreateState = { error?: string };

export async function createCaptions(_state: CreateState, form: FormData): Promise<CreateState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const photo = form.get("photo");
  const hint = String(form.get("hint") ?? "").trim();
  if (!(photo instanceof File) || photo.size === 0) return { error: "Choose a photo first." };
  if (photo.size > 3 * 1024 * 1024) return { error: "Choose a photo smaller than 3 MB." };
  if (hint.length > 140) return { error: "Keep the context under 140 characters." };
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) return { error: "Choose a JPG, PNG, or WebP photo." };

  // Reserve the generation first: the database enforces the daily limit
  // before the caption model is called.
  const theme = todaysTheme();
  const prompt = buildPrompt(theme, hint);
  const imagePath = `${user.id}/${crypto.randomUUID()}.${image.extension}`;
  const { data: generation, error: reserveError } = await supabase.from("generations")
    .insert({ image_path: imagePath, prompt, model: CAPTION_MODEL, theme }).select("id").single();
  if (reserveError || !generation) {
    return { error: reserveError?.message === "generation_limit"
      ? "That’s five photos today. Come back tomorrow for a new theme."
      : "Your photo couldn’t be saved. Please try again." };
  }

  async function fail(error: string): Promise<CreateState> {
    await supabase.from("generations").update({ status: "failed" }).eq("id", generation!.id);
    await supabase.storage.from("snaps").remove([imagePath]);
    return { error };
  }

  const { error: uploadError } = await supabase.storage.from("snaps")
    .upload(imagePath, bytes, { contentType: image.contentType, upsert: false });
  if (uploadError) return fail("Your photo couldn’t be uploaded. Please try again.");

  let captions: string[];
  try {
    captions = await captionPhoto(bytes, image.contentType, prompt);
  } catch (error) {
    console.error("Caption generation failed:", error instanceof Error ? error.message : error);
    return fail(error instanceof CaptionsPaused
      ? "Caption writing is paused for now. Your photo wasn’t posted; please try again later."
      : "The caption writer is stuck. Please try again in a minute.");
  }
  if (!captions.length) return fail("No captions came back for that photo. Try another one.");

  const { error: captionError } = await supabase.from("generated_captions")
    .insert(captions.map((body, index) => ({ generation_id: generation.id, position: index + 1, body })));
  if (captionError) return fail("Your captions couldn’t be saved. Please try again.");
  const { error: finishError } = await supabase.from("generations").update({ status: "ready" }).eq("id", generation.id);
  if (finishError) return fail("Your captions couldn’t be published. Please try again.");

  revalidatePath("/");
  redirect(`/#g-${generation.id}`);
}

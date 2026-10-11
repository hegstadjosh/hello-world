"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string };

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// One caption of your own per photo, competing with the AI's.
export async function addCaption(generationId: string, text: string): Promise<ActionResult> {
  const body = text.trim().replace(/\s+/g, " ");
  if (!isUuid(generationId)) return { error: "That photo isn’t available." };
  if (!body) return { error: "Write a caption first." };
  if (body.length > 120) return { error: "Keep it under 120 characters." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to add a caption." };
  const { error } = await supabase.from("generated_captions").insert({ generation_id: generationId, body });
  if (error) return { error: error.code === "23505" ? "You’ve already added a caption to this photo." : "Your caption couldn’t be saved. Please try again." };
  revalidatePath("/");
  return {};
}

export async function removeCaption(captionId: number): Promise<ActionResult> {
  if (!Number.isSafeInteger(captionId)) return { error: "That caption isn’t available." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to remove your caption." };
  const { data, error } = await supabase.from("generated_captions").delete().eq("id", captionId).select("id");
  if (error || !data?.length) return { error: "Your caption couldn’t be removed. Please try again." };
  revalidatePath("/");
  return {};
}

// Hides the post and deletes the photo file. The row stays so it still counts
// toward the daily posting limit.
export async function takeDown(generationId: string): Promise<ActionResult> {
  if (!isUuid(generationId)) return { error: "That photo isn’t available." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to take down your photo." };
  const { data, error } = await supabase.from("generations").update({ status: "removed" })
    .eq("id", generationId).eq("status", "ready").select("image_path").maybeSingle();
  if (error || !data) return { error: "Your photo couldn’t be taken down. Please try again." };
  await supabase.storage.from("snaps").remove([data.image_path]);
  revalidatePath("/");
  return {};
}

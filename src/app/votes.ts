"use server";

import { createClient } from "@/lib/supabase/server";
import type { Vote } from "@/lib/feed";

export type VoteResult = { upvotes: number; downvotes: number; myVote: Vote } | { error: string };

// Voting the same way twice removes the vote; voting the other way changes it.
export async function castVote(captionId: number, value: 1 | -1): Promise<VoteResult> {
  if (!Number.isSafeInteger(captionId) || (value !== 1 && value !== -1)) return { error: "That vote isn’t valid." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to vote." };

  const { data: existing, error: readError } = await supabase.from("caption_votes")
    .select("value").eq("caption_id", captionId).eq("user_id", user.id).maybeSingle();
  if (readError) return { error: "Your vote couldn’t be saved. Please try again." };
  const votes = supabase.from("caption_votes");
  const { error } = !existing
    ? await votes.insert({ caption_id: captionId, value })
    : existing.value === value
      ? await votes.delete().eq("caption_id", captionId).eq("user_id", user.id)
      : await votes.update({ value }).eq("caption_id", captionId).eq("user_id", user.id);
  if (error) return { error: "Your vote couldn’t be saved. Please try again." };

  const { data: caption, error: countError } = await supabase.from("generated_captions")
    .select("upvotes,downvotes").eq("id", captionId).single();
  if (countError || !caption) return { error: "Your vote was saved, but the totals didn’t load. Refresh to see them." };
  return { ...caption, myVote: existing?.value === value ? 0 : value };
}

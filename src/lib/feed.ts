import type { SupabaseClient } from "@supabase/supabase-js";

export type Vote = -1 | 0 | 1;
export type FeedCaption = { id: number; body: string; upvotes: number; downvotes: number; myVote: Vote };
export type FeedItem = {
  id: string; imageUrl: string; theme: string; prompt: string; model: string;
  createdAt: string; mine: boolean; captions: FeedCaption[];
};
export type FeedResult = { items: FeedItem[]; status: "ready" | "error" };

type Row = {
  id: string; user_id: string; image_path: string; theme: string; prompt: string; model: string; created_at: string;
  generated_captions: { id: number; body: string; upvotes: number; downvotes: number; position: number }[];
};

// Newest finished generations, with the viewer's own votes when signed in.
export async function getFeed(supabase: SupabaseClient, userId: string | null): Promise<FeedResult> {
  try {
    const { data, error } = await supabase.from("generations")
      .select("id,user_id,image_path,theme,prompt,model,created_at,generated_captions(id,body,upvotes,downvotes,position)")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(30)
      .abortSignal(AbortSignal.timeout(8000));
    if (error) return { items: [], status: "error" };
    const rows = (data ?? []) as Row[];
    const captionIds = rows.flatMap((row) => row.generated_captions.map((caption) => caption.id));
    const myVotes = new Map<number, Vote>();
    if (userId && captionIds.length) {
      const { data: votes, error: voteError } = await supabase.from("caption_votes")
        .select("caption_id,value").in("caption_id", captionIds);
      if (voteError) return { items: [], status: "error" };
      votes?.forEach((vote) => myVotes.set(vote.caption_id, vote.value as Vote));
    }
    const items = rows.filter((row) => row.generated_captions.length).map((row) => ({
      id: row.id,
      imageUrl: supabase.storage.from("snaps").getPublicUrl(row.image_path).data.publicUrl,
      theme: row.theme, prompt: row.prompt, model: row.model, createdAt: row.created_at,
      mine: row.user_id === userId,
      captions: [...row.generated_captions].sort((a, b) => a.position - b.position)
        .map(({ id, body, upvotes, downvotes }) => ({ id, body, upvotes, downvotes, myVote: myVotes.get(id) ?? 0 })),
    }));
    return { items, status: "ready" };
  } catch {
    return { items: [], status: "error" };
  }
}

// The best-rated caption posted in the last day, if anyone has upvoted one.
export function topCaptionToday(items: FeedItem[], now = Date.now()) {
  let best: { item: FeedItem; caption: FeedCaption } | null = null;
  for (const item of items) {
    if (now - Date.parse(item.createdAt) > 86_400_000) continue;
    for (const caption of item.captions) {
      const score = caption.upvotes - caption.downvotes;
      if (score > 0 && (!best || score > best.caption.upvotes - best.caption.downvotes)) best = { item, caption };
    }
  }
  return best;
}

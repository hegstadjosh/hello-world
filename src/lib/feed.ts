import type { SupabaseClient } from "@supabase/supabase-js";

export type Vote = -1 | 0 | 1;
export type FeedCaption = {
  id: number; body: string; upvotes: number; downvotes: number; myVote: Vote;
  byHuman: boolean; mine: boolean;
};
export type FeedItem = {
  id: string; imageUrl: string; theme: string; prompt: string; model: string;
  createdAt: string; mine: boolean; wroteOne: boolean; captions: FeedCaption[];
};
export type FeedResult = { items: FeedItem[]; status: "ready" | "error" };

type Row = {
  id: string; user_id: string; image_path: string; theme: string; prompt: string; model: string; created_at: string;
  generated_captions: { id: number; body: string; upvotes: number; downvotes: number; position: number | null; user_id: string }[];
};

// A fixed shuffle, so AI and human captions sit in the same mixed order for
// everyone and you can't tell who wrote what by where it appears.
const shuffleKey = (id: number) => Math.imul(id, 2654435761) >>> 0;

// Newest finished generations, with the viewer's own votes when signed in.
export async function getFeed(supabase: SupabaseClient, userId: string | null): Promise<FeedResult> {
  try {
    const { data, error } = await supabase.from("generations")
      .select("id,user_id,image_path,theme,prompt,model,created_at,generated_captions(id,body,upvotes,downvotes,position,user_id)")
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
    const items = rows.filter((row) => row.generated_captions.length).map((row) => {
      const captions = [...row.generated_captions]
        .sort((a, b) => shuffleKey(a.id) - shuffleKey(b.id))
        .map(({ id, body, upvotes, downvotes, position, user_id }) => ({
          id, body, upvotes, downvotes, myVote: myVotes.get(id) ?? 0,
          byHuman: position === null, mine: position === null && user_id === userId,
        }));
      return {
        id: row.id,
        imageUrl: supabase.storage.from("snaps").getPublicUrl(row.image_path).data.publicUrl,
        theme: row.theme, prompt: row.prompt, model: row.model, createdAt: row.created_at,
        mine: row.user_id === userId, wroteOne: captions.some((caption) => caption.mine), captions,
      };
    });
    return { items, status: "ready" };
  } catch {
    return { items: [], status: "error" };
  }
}

const score = (caption: FeedCaption) => caption.upvotes - caption.downvotes;

// The best-rated caption posted in the last day, if anyone has upvoted one.
export function topCaptionToday(items: FeedItem[], now = Date.now()) {
  let best: { item: FeedItem; caption: FeedCaption } | null = null;
  for (const item of items) {
    if (now - Date.parse(item.createdAt) > 86_400_000) continue;
    for (const caption of item.captions) {
      if (score(caption) > 0 && (!best || score(caption) > score(best.caption))) best = { item, caption };
    }
  }
  return best;
}

// For each photo from the last week, whoever wrote its top-voted caption wins
// that photo. Photos with no upvoted caption, or a tie at the top, count for no one.
export function humansVsAi(items: FeedItem[], now = Date.now()) {
  const tally = { humans: 0, ai: 0 };
  for (const item of items) {
    if (now - Date.parse(item.createdAt) > 7 * 86_400_000) continue;
    const top = Math.max(...item.captions.map(score));
    if (top <= 0) continue;
    const leaders = item.captions.filter((caption) => score(caption) === top);
    if (leaders.every((caption) => caption.byHuman)) tally.humans++;
    else if (leaders.every((caption) => !caption.byHuman)) tally.ai++;
  }
  return tally;
}

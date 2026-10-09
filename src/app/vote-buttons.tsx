"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { castVote } from "./votes";
import type { FeedCaption, Vote } from "@/lib/feed";

const tally = (counts: { upvotes: number; downvotes: number }, vote: Vote, delta: number) => ({
  upvotes: counts.upvotes + (vote === 1 ? delta : 0),
  downvotes: counts.downvotes + (vote === -1 ? delta : 0),
});

export function VoteButtons({ caption, signedIn }: { caption: FeedCaption; signedIn: boolean }) {
  const [state, setState] = useState({ upvotes: caption.upvotes, downvotes: caption.downvotes, myVote: caption.myVote });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const score = state.upvotes - state.downvotes;

  if (!signedIn) {
    return <div className="flex shrink-0 items-center gap-3 text-sm text-stone-500">
      <span aria-label={`${state.upvotes} up, ${state.downvotes} down`}>{score > 0 ? `+${score}` : score}</span>
      <Link href="/login" className="font-medium text-orange-800 underline underline-offset-4">Sign in to vote</Link>
    </div>;
  }

  function vote(value: 1 | -1) {
    const previous = state;
    const next = previous.myVote === value ? 0 : value;
    // Show the change immediately, then settle on the database's totals.
    setState({ ...tally(tally(previous, previous.myVote, -1), next, 1), myVote: next });
    setError(null);
    startTransition(async () => {
      const result = await castVote(caption.id, value);
      if ("error" in result) { setState(previous); setError(result.error); }
      else setState(result);
    });
  }

  const button = "flex size-9 items-center justify-center rounded-full border text-sm transition disabled:opacity-60";
  return <div className="flex shrink-0 flex-col items-end gap-1">
    <div className="flex items-center gap-2">
      <button type="button" disabled={pending} onClick={() => vote(1)} aria-pressed={state.myVote === 1} aria-label="Upvote"
        className={`${button} ${state.myVote === 1 ? "border-orange-700 bg-orange-700 text-white" : "border-stone-300 hover:border-orange-700"}`}>▲</button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-label={`${state.upvotes} up, ${state.downvotes} down`}>{score > 0 ? `+${score}` : score}</span>
      <button type="button" disabled={pending} onClick={() => vote(-1)} aria-pressed={state.myVote === -1} aria-label="Downvote"
        className={`${button} ${state.myVote === -1 ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 hover:border-stone-800"}`}>▼</button>
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

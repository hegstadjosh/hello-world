"use client";

import { useState, useTransition } from "react";
import { castVote } from "./votes";
import { removeCaption } from "./caption-actions";
import type { FeedCaption, Vote } from "@/lib/feed";

const tally = (counts: { upvotes: number; downvotes: number }, vote: Vote, delta: number) => ({
  upvotes: counts.upvotes + (vote === 1 ? delta : 0),
  downvotes: counts.downvotes + (vote === -1 ? delta : 0),
});

// Who wrote a caption stays hidden until you vote on it, so votes are about the joke.
export function CaptionRow({ caption, signedIn }: { caption: FeedCaption; signedIn: boolean }) {
  const [state, setState] = useState({ upvotes: caption.upvotes, downvotes: caption.downvotes, myVote: caption.myVote });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const score = state.upvotes - state.downvotes;
  const scoreText = <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-label={`${state.upvotes} up, ${state.downvotes} down`}>{score > 0 ? `+${score}` : score}</span>;
  const revealed = caption.mine || state.myVote !== 0;

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

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeCaption(caption.id);
      if (result.error) setError(result.error);
    });
  }

  const button = "flex size-9 items-center justify-center rounded-full border text-sm transition disabled:opacity-60";
  const controls = !signedIn ? <div className="text-stone-500">{scoreText}</div>
    : caption.mine ? <div className="flex flex-col items-end gap-1">
      {scoreText}
      <button type="button" disabled={pending} onClick={remove} className="text-xs text-stone-500 underline underline-offset-4 disabled:opacity-60">{pending ? "Removing…" : "Remove"}</button>
    </div>
    : <div className="flex items-center gap-2">
      <button type="button" disabled={pending} onClick={() => vote(1)} aria-pressed={state.myVote === 1} aria-label="Upvote"
        className={`${button} ${state.myVote === 1 ? "border-orange-700 bg-orange-700 text-white" : "border-stone-300 hover:border-orange-700"}`}>▲</button>
      {scoreText}
      <button type="button" disabled={pending} onClick={() => vote(-1)} aria-pressed={state.myVote === -1} aria-label="Downvote"
        className={`${button} ${state.myVote === -1 ? "border-stone-800 bg-stone-800 text-white" : "border-stone-300 hover:border-stone-800"}`}>▼</button>
    </div>;

  return <li className="flex items-start justify-between gap-4">
    <div>
      <p className="text-lg leading-snug">{caption.body}</p>
      {revealed && <p className={`mt-1 text-xs font-semibold uppercase tracking-widest ${caption.byHuman ? "text-teal-700" : "text-stone-400"}`}>
        {caption.mine ? "Your caption" : caption.byHuman ? "Written by a person" : "Written by AI"}
      </p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
    <div className="shrink-0">{controls}</div>
  </li>;
}

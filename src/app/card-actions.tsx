"use client";

import { useState, useTransition } from "react";
import { addCaption, takeDown } from "./caption-actions";

export function AddCaption({ generationId }: { generationId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)}
      className="mt-6 rounded-full border border-stone-300 px-5 py-2 text-sm font-medium hover:border-stone-900">Think you’re funnier? Add your caption</button>;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addCaption(generationId, text);
      if (result.error) setError(result.error);
    });
  }

  return <form onSubmit={submit} className="mt-6 space-y-3">
    <label className="block text-sm font-medium">Your caption
      <input autoFocus value={text} onChange={(event) => setText(event.target.value)} maxLength={120} disabled={pending}
        placeholder="Beat the AI" className="mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-normal" />
    </label>
    <div className="flex items-center gap-4">
      <button disabled={pending || !text.trim()} className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-60">{pending ? "Posting…" : "Post caption"}</button>
      <button type="button" disabled={pending} onClick={() => { setOpen(false); setText(""); setError(null); }} className="text-sm text-stone-500 underline underline-offset-4">Cancel</button>
      <span className="ml-auto text-xs tabular-nums text-stone-400">{text.length}/120</span>
    </div>
    <p className="text-xs text-stone-500">Posted without your name. Others see who wrote it only after they vote.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}

export function TakeDown({ generationId }: { generationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmAndTakeDown() {
    if (!window.confirm("Take this photo down? It and its captions will leave the feed for good.")) return;
    setError(null);
    startTransition(async () => {
      const result = await takeDown(generationId);
      if (result.error) setError(result.error);
    });
  }

  return <span className="text-right">
    <button type="button" disabled={pending} onClick={confirmAndTakeDown} className="text-stone-500 underline underline-offset-4 disabled:opacity-60">{pending ? "Taking down…" : "Take down"}</button>
    {error && <span role="alert" className="block text-xs text-red-700">{error}</span>}
  </span>;
}

"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useState } from "react";
import { createCaptions } from "./actions";

// Redraw the photo at most 1600px wide as a JPEG. This keeps uploads small
// and drops embedded metadata such as the phone's GPS location.
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("encode")), "image/jpeg", 0.85));
}

export function CreateForm({ theme }: { theme: string }) {
  const [state, action, pending] = useActionState(createCaptions, {});
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(file: File | undefined) {
    setPhoto(null); setPreview(null); setReadError(null);
    if (!file) return;
    try {
      const blob = await shrink(file);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setReadError("That photo couldn’t be opened here. Try a JPG or PNG.");
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo) return setReadError("Choose a photo first.");
    const form = new FormData(event.currentTarget);
    form.set("photo", photo, "photo.jpg");
    startTransition(() => action(form));
  }

  const error = readError ?? state.error;
  return <form onSubmit={submit} className="mt-8 space-y-6">
    <label className="block font-medium">Photo
      <input name="photo" type="file" accept="image/*" required disabled={pending} onChange={(event) => choose(event.target.files?.[0])}
        className="mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm" />
    </label>
    {preview && <Image unoptimized src={preview} alt="The photo you chose" width={640} height={480} className="max-h-80 w-full rounded-2xl object-cover" />}
    <label className="block font-medium">Context <span className="font-normal text-stone-500">(optional)</span>
      <input name="hint" maxLength={140} disabled={pending} placeholder="e.g. first time on the 1 train"
        className="mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3" />
    </label>
    <p className="text-sm text-stone-500">Today’s theme, “{theme},” goes into the prompt. Your photo and its captions appear in the public feed. Five photos a day.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={pending || !photo} className="rounded-full bg-stone-900 px-7 py-3 font-medium text-white disabled:opacity-60">{pending ? "Writing captions…" : "Write my captions"}</button>
  </form>;
}

"use client";

import { useActionState } from "react";
import { saveProfile } from "./actions";
import type { Profile } from "@/lib/profile";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(saveProfile, {});
  const inputStyle = "mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3";
  return <form action={action} className="mt-8 space-y-6">
    <label className="block font-medium">First name<input name="first_name" autoComplete="given-name" required maxLength={80} defaultValue={profile.first_name ?? ""} className={inputStyle} /></label>
    <label className="block font-medium">Last name<input name="last_name" autoComplete="family-name" required maxLength={80} defaultValue={profile.last_name ?? ""} className={inputStyle} /></label>
    <label className="block font-medium">Profile photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className={`${inputStyle} text-sm`} /><span className="mt-2 block text-sm font-normal text-stone-500">Optional · JPG, PNG, or WebP · up to 3 MB</span></label>
    {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
    <button disabled={pending} className="rounded-full bg-stone-900 px-7 py-3 font-medium text-white disabled:opacity-60">{pending ? "Saving…" : "Save profile"}</button>
  </form>;
}

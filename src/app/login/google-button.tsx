"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setPending(true);
    setError("");
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setError("Google sign-in could not start. Please try again.");
      setPending(false);
    }
  }
  return <>
    <button onClick={signIn} disabled={pending} className="rounded-full bg-stone-900 px-7 py-3 font-medium text-white disabled:opacity-60">
      {pending ? "Opening Google…" : "Continue with Google"}
    </button>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
  </>;
}

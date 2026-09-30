import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoogleButton } from "./google-button";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/members");
  const params = await searchParams;
  return <main className="mx-auto w-full max-w-lg px-6 py-20">
    <Link href="/" className="text-sm font-semibold text-orange-800">← Campus, captioned.</Link>
    <h1 className="mt-10 text-4xl font-semibold tracking-tight">Your campus corner.</h1>
    <p className="mb-8 mt-4 leading-relaxed text-stone-600">Sign in to make your profile and visit the members’ lounge.</p>
    {params.error && <p role="alert" className="mb-6 text-red-700">Sign-in wasn’t completed. Please try again.</p>}
    <GoogleButton />
    <p className="mt-6 text-sm text-stone-500"><Link href="/privacy" className="underline">Privacy</Link></p>
  </main>;
}

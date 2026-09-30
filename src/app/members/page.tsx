import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { signOut } from "./actions";

export default async function MembersPage() {
  const { supabase, profile } = await requireProfile();
  if (!profile.first_name?.trim() || !profile.last_name?.trim()) redirect("/profile");
  const avatar = profile.avatar_path ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl : null;
  return <main className="mx-auto w-full max-w-3xl px-6 py-16">
    <nav className="mb-12 flex flex-wrap items-center gap-6 text-sm font-medium"><Link href="/" className="text-orange-800">Campus, captioned.</Link><Link href="/profile">Edit profile</Link><form action={signOut}><button className="underline underline-offset-4">Sign out</button></form></nav>
    <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-orange-800">Members’ lounge</p>
    <div className="flex items-center gap-5">
      {avatar && <Image unoptimized src={avatar} alt="Your profile photo" width={80} height={80} className="size-20 rounded-full object-cover" />}
      <h1 className="text-4xl font-semibold tracking-tight">Hey, {profile.first_name}.</h1>
    </div>
    <p className="mt-5 text-lg text-stone-600">You made it. Take a breath. The deadline can wait one minute.</p>
    <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-8"><h2 className="text-2xl font-semibold">Today’s campus survival tip</h2><p className="mt-4 text-lg leading-relaxed text-stone-600">A study break is still a study break if you spend it thinking about how much studying you have left.</p></section>
    <p className="mt-8 text-sm text-stone-500">Signed in as {profile.first_name} {profile.last_name}</p>
  </main>;
}

import Link from "next/link";
import Image from "next/image";
import { requireProfile } from "@/lib/profile";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const { supabase, profile } = await requireProfile();
  const complete = profile.first_name?.trim() && profile.last_name?.trim();
  const avatar = profile.avatar_path ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl : null;
  return <main className="mx-auto w-full max-w-lg px-6 py-16">
    <Link href="/" className="text-sm font-semibold text-orange-800">← Campus, captioned.</Link>
    <h1 className="mt-10 text-4xl font-semibold tracking-tight">{complete ? "Your profile." : "First, a quick introduction."}</h1>
    <p className="mt-4 text-stone-600">{complete ? "Update your name or choose a new photo." : "Add your first and last name to enter the lounge."}</p>
    {avatar && <Image unoptimized src={avatar} alt="Your current profile photo" width={96} height={96} className="mt-6 size-24 rounded-full object-cover" />}
    <ProfileForm profile={profile} />
  </main>;
}

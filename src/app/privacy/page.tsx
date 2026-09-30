import Link from "next/link";

export default function PrivacyPage() {
  return <main className="mx-auto max-w-2xl px-6 py-16">
    <Link href="/" className="text-orange-800 underline">Campus, captioned.</Link>
    <h1 className="mt-10 text-4xl font-semibold">Privacy</h1>
    <div className="mt-6 space-y-5 leading-relaxed text-stone-600">
      <p>This is Josh Hegstad’s classroom demonstration for The Humor Project.</p>
      <p>Google sign-in provides your account identity, email address, and basic profile information to authenticate you. The app stores the first and last name you enter and any profile photo you upload in Supabase. These details support your profile and personalized members’ page.</p>
      <p>Your profile and uploaded photos are accessible through the app only to your signed-in account. The app uses authentication cookies to keep you signed in. Supabase, Google, and Vercel process data to provide authentication, storage, and hosting.</p>
      <p>For questions or to request deletion of your account and uploaded data, email <a className="underline" href="mailto:jhegstad12@gmail.com">jhegstad12@gmail.com</a>.</p>
    </div>
  </main>;
}

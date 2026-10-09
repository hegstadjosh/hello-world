import Link from "next/link";
import Image from "next/image";
import { getCaptions } from "@/lib/captions";
import { getFeed, topCaptionToday, type FeedItem } from "@/lib/feed";
import { createClient } from "@/lib/supabase/server";
import { todaysTheme } from "@/lib/themes";
import { VoteButtons } from "./vote-buttons";

export const dynamic = "force-dynamic";

const postedAt = (iso: string) => new Date(iso).toLocaleString("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

function FeedCard({ item, signedIn }: { item: FeedItem; signedIn: boolean }) {
  return <li id={`g-${item.id}`} className="scroll-mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
    <Image unoptimized src={item.imageUrl} alt={`Photo posted for “${item.theme}”`} width={800} height={600} className="aspect-[4/3] w-full object-cover" />
    <div className="p-6">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-orange-800">{item.theme}{item.mine && <span className="ml-2 text-stone-500">· Yours</span>}</p>
      <ol className="space-y-4">
        {item.captions.map((caption) => <li key={caption.id} className="flex items-start justify-between gap-4">
          <p className="text-lg leading-snug">{caption.body}</p>
          <VoteButtons caption={caption} signedIn={signedIn} />
        </li>)}
      </ol>
      <details className="mt-5 text-sm text-stone-500">
        <summary className="cursor-pointer">Posted {postedAt(item.createdAt)} · How Gemini was asked</summary>
        <p className="mt-2 text-xs">Model: {item.model}</p>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-100 p-3 font-mono text-xs leading-relaxed">{item.prompt}</pre>
      </details>
    </div>
  </li>;
}

export default async function Home() {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = configured ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const [{ captions, status }, feed] = await Promise.all([
    getCaptions(),
    supabase ? getFeed(supabase, user?.id ?? null) : Promise.resolve({ items: [], status: "error" as const }),
  ]);
  const theme = todaysTheme();
  const top = topCaptionToday(feed.items);
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14 sm:px-10 sm:py-24">
      <header className="mb-12 border-b border-stone-300 pb-10">
        <nav className="mb-8 flex flex-wrap gap-6 text-sm font-medium">
          {user ? <><Link href="/create" className="text-orange-800 underline underline-offset-4">Caption a photo</Link><Link href="/members">Members’ lounge</Link><Link href="/profile">Your profile</Link></>
            : <Link href="/login" className="text-orange-800 underline underline-offset-4">Sign in with Google</Link>}
        </nav>
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-orange-800">Campus, captioned.</p>
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight sm:text-7xl">A little too relatable.</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600">Post a photo from your week. AI writes the captions. Everyone votes on the funniest.</p>
      </header>

      <section className="mb-10 flex flex-col gap-5 rounded-2xl bg-stone-900 p-8 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-300">Today’s theme</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{theme}</h2>
          <p className="mt-2 text-stone-300">A new theme every morning. Snap something that fits.</p>
        </div>
        <Link href={user ? "/create" : "/login"} className="shrink-0 self-start rounded-full bg-white px-6 py-3 font-medium text-stone-900 sm:self-center">{user ? "Caption a photo" : "Sign in to post and vote"}</Link>
      </section>

      {top && <section className="mb-10 rounded-2xl border-2 border-orange-700 bg-white p-7">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-800">Today’s top caption</p>
        <p className="mt-3 text-2xl font-semibold leading-snug tracking-tight">“{top.caption.body}”</p>
        <a href={`#g-${top.item.id}`} className="mt-3 inline-block text-sm text-stone-600 underline underline-offset-4">+{top.caption.upvotes - top.caption.downvotes} · see the photo</a>
      </section>}

      <section aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="mb-6 text-2xl font-semibold tracking-tight">Fresh captions</h2>
        {feed.status === "error" ? (
          <p className="rounded-2xl border border-stone-200 bg-white p-8 text-stone-600">The feed isn’t available right now. Please try again shortly.</p>
        ) : feed.items.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white p-8 text-stone-600">No photos yet. Be the first to caption one.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2">{feed.items.map((item) => <FeedCard key={item.id} item={item} signedIn={!!user} />)}</ul>
        )}
      </section>

      <section aria-labelledby="archive-heading" className="mt-16 border-t border-stone-300 pt-10">
        <h2 id="archive-heading" className="mb-6 text-2xl font-semibold tracking-tight">From the archive</h2>
        {status === "ready" && captions.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2">
            {captions.map((item) => (
              <li key={item.id} className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
                <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-orange-800">{item.category}</p>
                <h3 className="mb-3 text-xl font-semibold tracking-tight">{item.title}</h3>
                <p className="text-lg leading-relaxed text-stone-600">{item.caption}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-600">{status === "ready" ? "Nothing here yet." : "The archive isn’t available right now."}</p>
        )}
      </section>
      <footer className="mt-12 text-sm text-stone-500">Made by Josh · The Humor Project · <Link href="/privacy" className="underline">Privacy</Link></footer>
    </main>
  );
}

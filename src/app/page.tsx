import Link from "next/link";
import { getCaptions } from "@/lib/captions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { captions, status } = await getCaptions();
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14 sm:px-10 sm:py-24">
      <header className="mb-12 border-b border-stone-300 pb-10">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-orange-800">Campus, captioned.</p>
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight sm:text-7xl">A little too relatable.</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600">Small observations about student life. Big deadline energy.</p>
      </header>
      {status === "ready" && captions.length > 0 ? (
        <>
          <p className="mb-6 text-sm text-stone-600">{captions.length} campus observations</p>
          <ul className="grid gap-5 sm:grid-cols-2">
            {captions.map((item) => (
              <li key={item.id} className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
                <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-orange-800">{item.category}</p>
                <h2 className="mb-3 text-xl font-semibold tracking-tight">{item.title}</h2>
                <p className="text-lg leading-relaxed text-stone-600">{item.caption}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <section aria-live="polite" className="rounded-2xl border border-stone-200 bg-white p-8">
          <h2 className="text-xl font-semibold">{status === "ready" ? "Nothing here yet." : "The captions aren’t available yet."}</h2>
          <p className="mt-3 text-stone-600">{status === "ready" ? "Check back for the first campus observations." : "Please try again shortly."}</p>
          {status === "error" && <Link href="/" className="mt-5 inline-block font-medium text-orange-800 underline underline-offset-4">Try again</Link>}
        </section>
      )}
      <footer className="mt-12 text-sm text-stone-500">Made by Josh · The Humor Project</footer>
    </main>
  );
}

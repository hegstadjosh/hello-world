"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-lg px-6 py-20"><h1 className="text-3xl font-semibold">Something didn’t load.</h1><p className="my-5 text-stone-600">Please try again in a moment.</p><button onClick={reset} className="rounded-full bg-stone-900 px-6 py-3 text-white">Try again</button></main>;
}

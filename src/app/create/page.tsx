import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todaysTheme } from "@/lib/themes";
import { CreateForm } from "./create-form";

export default async function CreatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const theme = todaysTheme();
  return <main className="mx-auto w-full max-w-lg px-6 py-16">
    <Link href="/" className="text-sm font-semibold text-orange-800">← Campus, captioned.</Link>
    <p className="mt-10 text-sm font-semibold uppercase tracking-widest text-orange-800">Today’s theme · {theme}</p>
    <h1 className="mt-3 text-4xl font-semibold tracking-tight">Caption a photo.</h1>
    <p className="mt-4 leading-relaxed text-stone-600">Upload something you saw this week. Gemini writes three captions, then everyone votes on the best one.</p>
    <CreateForm theme={theme} />
  </main>;
}

import { createClient } from "@supabase/supabase-js";

export type Caption = { id: number; title: string; caption: string; category: string };
export type CaptionResult = { captions: Caption[]; status: "ready" | "unconfigured" | "error" };

export async function getCaptions(): Promise<CaptionResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { captions: [], status: "unconfigured" };

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("campus_captions")
      .select("id,title,caption,category")
      .order("id")
      .limit(50)
      .abortSignal(AbortSignal.timeout(8000));
    if (error) return { captions: [], status: "error" };
    return { captions: data ?? [], status: "ready" };
  } catch {
    return { captions: [], status: "error" };
  }
}

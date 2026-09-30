import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles")
          .select("first_name,last_name").eq("id", user.id).single();
        const destination = profile?.first_name?.trim() && profile?.last_name?.trim() ? "/members" : "/profile";
        return NextResponse.redirect(new URL(destination, url.origin));
      }
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}

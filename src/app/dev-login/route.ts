import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Local-only sign-in bypass: with `DEV_AUTH_BYPASS=1 next dev`, visiting /dev-login
// signs you in as DEV_LOGIN_EMAIL with a real session, so RLS and writes work.
// Returns 404 in production or when the flag is off.
export async function GET(request: Request) {
  const email = process.env.DEV_LOGIN_EMAIL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV !== "development" || process.env.DEV_AUTH_BYPASS !== "1" || !email || !serviceKey) {
    return new NextResponse("Not found", { status: 404 });
  }
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) return new NextResponse(`Dev login failed: ${error?.message}`, { status: 500 });
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (verifyError) return new NextResponse(`Dev login failed: ${verifyError.message}`, { status: 500 });
  return NextResponse.redirect(new URL("/", request.url));
}

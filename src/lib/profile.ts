import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = { first_name: string | null; last_name: string | null; avatar_path: string | null };

export async function requireProfile() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("first_name,last_name,avatar_path").eq("id", user.id).single();
  if (profileError) throw new Error("Your profile could not be loaded. Please try again.");
  return { supabase, user, profile: profile as Profile };
}

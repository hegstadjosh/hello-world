"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";

export type SaveState = { error?: string };

function imageExtension(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return "png";
  if (String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "webp";
  return null;
}

export async function saveProfile(_state: SaveState, form: FormData): Promise<SaveState> {
  const { supabase, user, profile } = await requireProfile();
  const firstName = String(form.get("first_name") ?? "").trim();
  const lastName = String(form.get("last_name") ?? "").trim();
  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) {
    return { error: "Enter your first and last name (up to 80 characters each)." };
  }
  const photo = form.get("photo");
  let avatarPath = profile.avatar_path;
  let newPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 3 * 1024 * 1024) return { error: "Choose a photo smaller than 3 MB." };
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const extension = imageExtension(bytes);
    if (!extension) return { error: "Choose a JPG, PNG, or WebP photo." };
    newPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const contentType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    const { error } = await supabase.storage.from("avatars").upload(newPath, bytes, { contentType, upsert: false });
    if (error) return { error: "Your photo couldn’t be uploaded. Please try again." };
    avatarPath = newPath;
  }
  const { error, data } = await supabase.from("profiles")
    .update({ first_name: firstName, last_name: lastName, ...(newPath ? { avatar_path: avatarPath } : {}) })
    .eq("id", user.id).select("id").single();
  if (error || !data) {
    if (newPath) await supabase.storage.from("avatars").remove([newPath]);
    return { error: "Your profile couldn’t be saved. Please try again." };
  }
  revalidatePath("/profile");
  revalidatePath("/members");
  redirect("/members");
}

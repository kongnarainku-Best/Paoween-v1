"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { deletionGrantCookie, deletionReauthCookie } from "@/lib/finance/account-deletion";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function signInWithGoogle() {
  if (!hasSupabaseEnv()) redirect("/?error=setup");

  const cookieStore = await cookies();
  cookieStore.delete(deletionReauthCookie);
  cookieStore.delete(deletionGrantCookie);
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", siteUrl).toString() },
  });

  if (error || !data.url) redirect("/?error=oauth");
  redirect(data.url);
}

export async function signOut() {
  if (!hasSupabaseEnv()) redirect("/");
  const cookieStore = await cookies();
  cookieStore.delete(deletionReauthCookie);
  cookieStore.delete(deletionGrantCookie);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

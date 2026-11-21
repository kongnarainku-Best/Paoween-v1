"use server";

import { cookies } from "next/headers";

import { getSignedInUser } from "@/lib/finance/server";

export async function completeOnboardingAction(): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getSignedInUser();
  const { error } = await supabase.auth.updateUser({ data: { paoween_onboarding_completed: true } });
  if (error) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set("paoween_setup_complete", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
  });
  return { ok: true };
}

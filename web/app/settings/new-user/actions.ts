"use server";

import { cookies } from "next/headers";
import { redirect, RedirectType } from "next/navigation";

import { createPocket } from "@/app/dashboard/pockets/actions";
import { onboardingSessionScope } from "@/lib/finance/onboarding";
import { getSignedInUser } from "@/lib/finance/server";

type SetupInput = {
  scope: string;
  reviewSlip: boolean;
  pocket?: { name: string; opening_balance_thb: string; opening_date: string };
};

export async function completeOnboardingAction(input: SetupInput): Promise<{ error: string; fieldErrors?: Record<string, string> }> {
  const { supabase, userId, claims } = await getSignedInUser();
  if (onboardingSessionScope(userId, claims) !== input.scope) return { error: "เซสชันเปลี่ยนไป กรุณาโหลดหน้าใหม่" };
  if (input.pocket) {
    const result = await createPocket({ ...input.pocket, id: userId });
    if (!result.ok) return result;
  }

  const { error } = await supabase.auth.updateUser({ data: { paoween_onboarding_completed: true } });
  if (error) return { error: "บันทึกสถานะเริ่มต้นไม่สำเร็จ ลองอีกครั้งนะ" };

  const cookieStore = await cookies();
  cookieStore.set("paoween_setup_complete", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
  });
  redirect(input.reviewSlip ? "/dashboard/assistant" : "/dashboard", RedirectType.replace);
}

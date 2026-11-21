import { redirect } from "next/navigation";

import { NewUserSetup } from "@/app/settings/new-user/new-user-setup";
import { hasCompletedInitialSetup } from "@/lib/finance/onboarding";
import { getSignedInUser } from "@/lib/finance/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const { supabase, userId, claims } = await getSignedInUser();
  const cookieStore = await cookies();
  if (cookieStore.get("paoween_setup_complete")?.value === userId || hasCompletedInitialSetup(claims as Record<string, unknown>)) {
    redirect("/dashboard");
  }

  const { count, error } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (!error && (count ?? 0) > 0) redirect("/dashboard");

  return <NewUserSetup accountName={typeof claims.email === "string" ? claims.email : "บัญชีของคุณ"} />;
}

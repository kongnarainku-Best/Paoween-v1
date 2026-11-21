import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { signOut } from "@/app/actions";
import { AssistantDock } from "@/app/dashboard/assistant/assistant-dock";
import { DashboardNav } from "@/app/dashboard/dashboard-nav";
import { DashboardRouteTransition } from "@/app/dashboard/dashboard-route-transition";
import { hasCompletedInitialSetup, onboardingSessionScope } from "@/lib/finance/onboarding";
import { listPocketOptions } from "@/lib/finance/pocket-server";
import { getSignedInUser } from "@/lib/finance/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, userId, claims } = await getSignedInUser();
  const email = typeof claims.email === "string" ? claims.email : "บัญชี Google ของคุณ";
  const onboardingScope = onboardingSessionScope(userId, claims);
  const cookieStore = await cookies();
  const setupCookie = cookieStore.get("paoween_setup_complete")?.value;
  const setupComplete = setupCookie === userId || hasCompletedInitialSetup(claims as Record<string, unknown>);

  const transactionCount = setupComplete ? null : await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId);

  if (!setupComplete && transactionCount && !transactionCount.error && (transactionCount.count ?? 0) === 0) redirect("/settings/new-user");

  const pockets = await listPocketOptions(supabase, userId);

  return <main className="workspace-page">
    <aside className="workspace-rail" aria-label="เมนูหลัก">
      <Link className="rail-brand" href="/dashboard" aria-label="น้องเป๋าวีน หน้าภาพรวม"><Image src="/paoween/paoween.webp" alt="" width={48} height={48} unoptimized /></Link>
      <DashboardNav />
      <div className="rail-bottom"><span>ข้อมูลบัญชีแยกตามผู้ใช้</span></div>
    </aside>
    <section className="workspace-main">
      <header className="workspace-header">
        <Link className="wordmark" href="/dashboard"><Image src="/paoween/paoween.webp" alt="" width={34} height={34} unoptimized /><span>น้องเป๋าวีน</span></Link>
        <div className="account-menu">
          <span className="account-status"><LockKeyhole size={14} aria-hidden="true" /> พื้นที่ของฉัน</span>
          <span className="account-email" title={email}>{email}</span>
          <form action={signOut}><button className="text-button" type="submit">ออกจากระบบ</button></form>
        </div>
      </header>
      <DashboardRouteTransition>{children}</DashboardRouteTransition>
      <AssistantDock key={onboardingScope} onboardingScope={onboardingScope} pockets={pockets} />
    </section>
  </main>;
}

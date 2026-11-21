"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useOnboardingHandoff } from "@/app/settings/new-user/onboarding-handoff";

type Summary = { fileKind: "image" | "pdf" | null };

export function OnboardingSummary({ scope }: { scope: string }) {
  const handoff = useOnboardingHandoff();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const pending = handoff.take(scope, "summary");
    if (pending?.kind === "summary") setSummary(pending);
  }, [scope, handoff]);

  if (!summary) return null;
  return <aside className="onboarding-summary" aria-label="สรุปการเริ่มต้น">
    <span className="onboarding-summary-check"><Check size={17} aria-hidden="true" /></span>
    <div className="onboarding-summary-copy"><strong>เริ่มต้นพื้นที่ของคุณแล้ว</strong><span>
      {summary.fileKind === "pdf" ? "เลือก statement PDF ไว้ดูชื่อไฟล์เท่านั้น ยังไม่ได้อัปโหลดหรืออ่านเนื้อหา" : summary.fileKind === "image" ? "เลือกสลิปไว้ดูตัวอย่างเท่านั้น ยังไม่ได้อัปโหลด" : "ยังไม่ได้เลือกไฟล์"}
    </span></div>
    <button className="onboarding-summary-dismiss" type="button" aria-label="ปิดสรุปการเริ่มต้น" onClick={() => setSummary(null)}><X size={16} aria-hidden="true" /></button>
  </aside>;
}

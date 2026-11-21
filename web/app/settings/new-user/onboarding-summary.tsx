"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

type Summary = { salary: number | null; hasSlip: boolean };

export function OnboardingSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const key = "paoween-onboarding-handoff";
    let value: Summary | null = null;
    try {
      const raw = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const candidate = parsed as Record<string, unknown>;
          const salary = candidate.salary;
          if ((salary === null || typeof salary === "number" && Number.isFinite(salary) && salary > 0) && typeof candidate.hasSlip === "boolean") {
            value = { salary, hasSlip: candidate.hasSlip };
          }
        }
      }
    } catch {
      sessionStorage.removeItem(key);
    }
    setSummary(value);
  }, []);

  if (!summary) return null;
  return <aside className="onboarding-summary" aria-label="สรุปการเริ่มต้น">
    <span className="onboarding-summary-check"><Check size={17} aria-hidden="true" /></span>
    <div className="onboarding-summary-copy"><strong>เริ่มต้นพื้นที่ของคุณแล้ว</strong><span>
      {summary.salary === null ? "ไม่ได้ระบุเงินเดือน" : `เงินเดือนสุทธิที่ใส่ไว้ ${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(summary.salary)} บาท / เดือน`}
      {summary.hasSlip ? " · เลือกสลิปไว้ดูตัวอย่างเท่านั้น ยังไม่ได้อัปโหลด" : " · ยังไม่ได้เลือกสลิป"}
    </span></div>
    <button className="onboarding-summary-dismiss" type="button" aria-label="ปิดสรุปการเริ่มต้น" onClick={() => setSummary(null)}><X size={16} aria-hidden="true" /></button>
  </aside>;
}

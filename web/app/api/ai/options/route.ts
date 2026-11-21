import { NextResponse } from "next/server";

import { getAiReadiness } from "@/lib/finance/ai-readiness";
import { currentThaiTaxYear, getSignedInUser } from "@/lib/finance/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, userId } = await getSignedInUser();
  const currentYear = currentThaiTaxYear() - 543;
  const [{ data: transactionDates }, { data: taxYears }, readiness] = await Promise.all([
    supabase.from("transactions").select("transaction_date").eq("user_id", userId).order("transaction_date", { ascending: false }).limit(5000),
    supabase.from("tax_records").select("tax_year").eq("user_id", userId).order("tax_year", { ascending: false }).limit(1000),
    getAiReadiness(),
  ]);

  const years = [...new Set([
    currentYear,
    ...(transactionDates ?? []).map((row) => Number(row.transaction_date.slice(0, 4))),
    ...(taxYears ?? []).map((row) => Number(row.tax_year) - 543),
  ].filter((year) => Number.isInteger(year) && year >= 1900 && year <= currentYear + 1))]
    .sort((a, b) => b - a).map(String);
  const months = [
    { key: "all", label: "ทุกเดือน" },
    ...Array.from({ length: 12 }, (_, index) => ({
      key: String(index + 1).padStart(2, "0"),
      label: new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "Asia/Bangkok" }).format(new Date(Date.UTC(2026, index, 1))),
    })),
  ];

  return NextResponse.json({ years, months, initialYear: String(currentYear), ready: readiness.ready }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

import { NextResponse } from "next/server";

import { getSignedInUser } from "@/lib/finance/server";

export const dynamic = "force-dynamic";

async function readAll<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await load(from, from + 999);
    if (error) throw new Error("export-query-failed");
    if (!data) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

export async function GET() {
  const { supabase, userId, claims } = await getSignedInUser();
  try {
    const [transactions, taxRecords] = await Promise.all([
      readAll((from, to) => supabase.from("transactions").select("id,transaction_date,transaction_type,description,amount_thb,category,action,source,source_reference,data_quality_flag,created_at,updated_at")
        .eq("user_id", userId).order("transaction_date", { ascending: true }).range(from, to)),
      readAll((from, to) => supabase.from("tax_records").select("id,transaction_id,tax_year,record_type,tax_category,amount_thb,source_reference,document_status,review_status,notes,created_at,updated_at")
        .eq("user_id", userId).order("tax_year", { ascending: true }).range(from, to)),
    ]);
    const payload = {
      format: "paoween-finance-export-v1",
      exported_at: new Date().toISOString(),
      account_email: typeof claims.email === "string" ? claims.email : null,
      transactions,
      tax_records: taxRecords,
    };
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="paoween-export-${day}.json"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "ส่งออกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}

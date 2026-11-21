import Link from "next/link";

import { TaxRecordForm } from "@/app/dashboard/tax-record-form";
import { currentThaiTaxYear, getSignedInUser } from "@/lib/finance/server";

type Search = Promise<{ year?: string }>;

export default async function NewTaxRecordPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const { supabase, userId } = await getSignedInUser();
  const { data } = await supabase.from("transactions").select("id,transaction_date,description,amount_thb")
    .eq("user_id", userId).order("transaction_date", { ascending: false }).limit(200);
  const year = Math.max(2400, Math.min(2700, Number.parseInt(params.year ?? "", 10) || currentThaiTaxYear()));
  return <div className="workspace-content narrow-content">
    <div className="breadcrumbs"><Link href="/dashboard/tax">เตรียมภาษี</Link><span>/</span><span>เพิ่มรายการ</span></div>
    <div className="dashboard-heading compact-heading"><div><p className="eyebrow">NEW TAX RECORD</p><h1>เพิ่มรายการภาษี<span className="period">.</span></h1><p className="muted">ใส่เฉพาะข้อมูลที่มีหลักฐานรองรับ และคงสถานะรอตรวจไว้เมื่อยังไม่แน่ใจ</p></div></div>
    <TaxRecordForm transactions={data ?? []} currentYear={year} />
  </div>;
}

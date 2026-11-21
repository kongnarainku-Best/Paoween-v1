import Link from "next/link";
import { notFound } from "next/navigation";

import { TaxRecordForm } from "@/app/dashboard/tax-record-form";
import { currentThaiTaxYear, getSignedInUser } from "@/lib/finance/server";
import type { TaxRecordInput } from "@/lib/finance/validation";

export default async function EditTaxRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await getSignedInUser();
  const [{ data: record, error }, { data: transactions }] = await Promise.all([
    supabase.from("tax_records").select("id,transaction_id,tax_year,record_type,tax_category,amount_thb,source_reference,document_status,review_status,notes").eq("id", id).eq("user_id", userId).maybeSingle(),
    supabase.from("transactions").select("id,transaction_date,description,amount_thb").eq("user_id", userId).order("transaction_date", { ascending: false }).limit(200),
  ]);
  if (error || !record) notFound();
  return <div className="workspace-content narrow-content">
    <div className="breadcrumbs"><Link href={`/dashboard/tax?year=${record.tax_year}`}>เตรียมภาษี</Link><span>/</span><span>แก้ไขรายการ</span></div>
    <div className="dashboard-heading compact-heading"><div><p className="eyebrow">EDIT TAX RECORD</p><h1>แก้ไขรายการภาษี<span className="period">.</span></h1></div></div>
    <TaxRecordForm record={record as TaxRecordInput & { id: string }} transactions={transactions ?? []} currentYear={currentThaiTaxYear()} />
  </div>;
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { TransactionForm } from "@/app/dashboard/transaction-form";
import { getSignedInUser } from "@/lib/finance/server";
import type { TransactionInput } from "@/lib/finance/validation";

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await getSignedInUser();
  const { data, error } = await supabase.from("transactions").select("id,transaction_date,transaction_type,description,amount_thb,category,action")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !data) notFound();
  return <div className="workspace-content narrow-content">
    <div className="breadcrumbs"><Link href="/dashboard/transactions">รายรับรายจ่าย</Link><span>/</span><span>แก้ไขรายการ</span></div>
    <div className="dashboard-heading compact-heading"><div><p className="eyebrow">EDIT TRANSACTION</p><h1>แก้ไขรายการ<span className="period">.</span></h1></div></div>
    <TransactionForm record={data as TransactionInput & { id: string }} />
  </div>;
}

import Link from "next/link";

import { TransactionForm } from "@/app/dashboard/transaction-form";
import { getSignedInUser } from "@/lib/finance/server";

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams;
  await getSignedInUser();
  const initialType = ["income", "expense", "investment", "transfer"].includes(params.type ?? "") ? params.type as "income" | "expense" | "investment" | "transfer" : undefined;
  return <div className="workspace-content narrow-content">
    <div className="breadcrumbs"><Link href="/dashboard/transactions">รายรับรายจ่าย</Link><span>/</span><span>เพิ่มรายการ</span></div>
    <div className="dashboard-heading compact-heading"><div><p className="eyebrow">NEW TRANSACTION</p><h1>เพิ่มรายการ<span className="period">.</span></h1><p className="muted">บันทึกรายการด้วยตนเอง รายการซ้ำจะมีขั้นตอนยืนยันเพิ่ม</p></div></div>
    <TransactionForm initialType={initialType} />
  </div>;
}

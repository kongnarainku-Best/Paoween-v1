import { randomUUID } from "node:crypto";
import Link from "next/link";

import { TransactionForm } from "@/app/dashboard/transaction-form";
import { bangkokDate } from "@/lib/finance/pocket";
import { listPocketOptions } from "@/lib/finance/pocket-server";
import { getSignedInUser } from "@/lib/finance/server";

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ type?: string; from?: string }> }) {
  const params = await searchParams;
  const { supabase, userId } = await getSignedInUser();
  const pockets = await listPocketOptions(supabase, userId);
  const fromSalary = params.from === "salary";
  const initialType = ["income", "expense", "investment", "transfer"].includes(params.type ?? "") ? params.type as "income" | "expense" | "investment" | "transfer" : undefined;
  return <div className="workspace-content narrow-content">
    <div className="breadcrumbs"><Link href={fromSalary ? "/dashboard" : "/dashboard/transactions"}>{fromSalary ? "ภาพรวม" : "รายรับรายจ่าย"}</Link><span>/</span><span>เพิ่มรายการ</span></div>
    <div className="dashboard-heading compact-heading"><div><p className="eyebrow">NEW TRANSACTION</p><h1>{fromSalary ? "บันทึกเงินเดือนที่ได้รับ" : "เพิ่มรายการ"}<span className="period">.</span></h1><p className="muted">{fromSalary ? "เลือกวันที่เงินเข้าจริงและตรวจยอดก่อนบันทึก" : "บันทึกรายการด้วยตนเอง รายการซ้ำจะมีขั้นตอนยืนยันเพิ่ม"}</p></div></div>
    <TransactionForm key={fromSalary ? `salary:${userId}` : initialType ?? "expense"} initialType={initialType} salaryForUser={fromSalary ? userId : undefined} submissionId={randomUUID()} pockets={pockets} today={bangkokDate()} />
  </div>;
}

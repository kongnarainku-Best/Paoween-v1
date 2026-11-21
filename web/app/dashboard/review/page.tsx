import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileCheck2 } from "lucide-react";
import { formatThaiDate, formatTHB, getSignedInUser } from "@/lib/finance/server";
import { transactionTypeLabels } from "@/lib/finance/validation";

export default async function ReviewPage() {
  const { supabase, userId } = await getSignedInUser();
  const [transactions, taxRecords] = await Promise.all([
    supabase.from("transactions").select("id,transaction_date,transaction_type,description,amount_thb,category,data_quality_flag", { count: "exact" })
      .eq("user_id", userId).not("data_quality_flag", "is", null).neq("data_quality_flag", "").order("transaction_date", { ascending: false }).limit(100),
    supabase.from("tax_records").select("id,tax_year,record_type,tax_category,amount_thb,document_status,review_status", { count: "exact" })
      .eq("user_id", userId).eq("review_status", "needs_review").order("created_at", { ascending: false }).limit(100),
  ]);
  const transactionRows = transactions.data ?? [];
  const taxRows = taxRecords.data ?? [];
  const failed = Boolean(transactions.error || taxRecords.error);

  return <div className="workspace-content">
    <div className="dashboard-heading"><div><p className="eyebrow">REVIEW DESK</p><h1>เรื่องที่รอเราตรวจ<span className="period">.</span></h1><p className="muted">รายการที่คุณทำเครื่องหมายไว้ และรายการภาษีที่ยังรอตรวจ</p></div></div>
    {failed && <p className="notice notice-error" role="alert">โหลดงานตรวจไม่ครบ กรุณาโหลดหน้าใหม่</p>}
    <div className="review-metrics"><article className="metric-card amber"><span><ClipboardCheck size={17} aria-hidden="true" /> รายการบัญชี</span><strong>{transactions.count ?? transactionRows.length}</strong></article><article className="metric-card blue"><span><FileCheck2 size={17} aria-hidden="true" /> รายการภาษี</span><strong>{taxRecords.count ?? taxRows.length}</strong></article></div>
    <div className="dashboard-columns review-columns">
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">TRANSACTIONS</p><h2>รายการบัญชีที่ทำเครื่องหมายไว้</h2></div></div>
        {transactionRows.length ? <div className="activity-list">{transactionRows.map((row) => <div className="review-row" key={row.id}><div><strong>{row.description}</strong><small>{formatThaiDate(row.transaction_date)} · {transactionTypeLabels[row.transaction_type as keyof typeof transactionTypeLabels] ?? row.transaction_type} · {row.category}</small><p>{row.data_quality_flag}</p></div><span>{formatTHB(Number(row.amount_thb))}</span><Link className="text-link" href={`/dashboard/transactions/${row.id}/edit`} aria-label={`ตรวจและแก้ไข ${row.description}`}><ArrowRight size={16} aria-hidden="true" /></Link></div>)}{(transactions.count ?? 0) > 100 && <p className="small-note">แสดง 100 รายการแรกจากทั้งหมด {transactions.count}</p>}</div> : <div className="inline-empty"><p>ไม่มีรายการบัญชีที่ทำเครื่องหมายรอตรวจ</p></div>}
      </section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">TAX RECORDS</p><h2>หลักฐานภาษีที่รอตรวจ</h2></div></div>
        {taxRows.length ? <div className="activity-list">{taxRows.map((row) => <div className="review-row" key={row.id}><div><strong>{row.tax_category}</strong><small>ปีภาษี {row.tax_year} · {row.document_status === "provided" || row.document_status === "verified" ? "มีเอกสาร" : "ยังไม่มีเอกสาร"}</small><p>{row.record_type}</p></div><span>{formatTHB(row.amount_thb)}</span><Link className="text-link" href={`/dashboard/tax/${row.id}/edit`} aria-label={`ตรวจรายการภาษี ${row.tax_category}`}><ArrowRight size={16} aria-hidden="true" /></Link></div>)}{(taxRecords.count ?? 0) > 100 && <p className="small-note">แสดง 100 รายการแรกจากทั้งหมด {taxRecords.count}</p>}</div> : <div className="inline-empty"><p>ไม่มีรายการภาษีที่รอตรวจ</p><Link className="button-secondary" href="/dashboard/tax">เปิดหน้าเตรียมภาษี</Link></div>}
      </section>
    </div>
  </div>;
}

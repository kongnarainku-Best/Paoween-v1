import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Plus, TrendingUp } from "lucide-react";
import { formatThaiDate, formatTHB, getSignedInUser } from "@/lib/finance/server";
import { InvestmentSimulator } from "@/app/dashboard/investment-simulator";

type Row = { id: string; transaction_date: string; description: string; amount_thb: number | string; category: string; action: string | null };

export default async function InvestmentPage() {
  const { supabase, userId } = await getSignedInUser();
  const rows: Row[] = [];
  let offset = 0;
  let failed = false;
  while (true) {
    const result = await supabase.from("transactions").select("id,transaction_date,description,amount_thb,category,action")
      .eq("user_id", userId).eq("transaction_type", "investment")
      .order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + 999);
    if (result.error || !result.data) { failed = true; break; }
    rows.push(...result.data as Row[]);
    if (result.data.length < 1000) break;
    offset += 1000;
  }
  const totals = rows.reduce((result, row) => {
    if (row.action?.toLowerCase() === "buy") result.buy += Number(row.amount_thb);
    if (row.action?.toLowerCase() === "sell") result.sell += Number(row.amount_thb);
    return result;
  }, { buy: 0, sell: 0 });

  return <div className="workspace-content">
    <div className="dashboard-heading"><div><p className="eyebrow">INVESTMENT JOURNAL</p><h1>การลงทุนของเรา<span className="period">.</span></h1><p className="muted">บันทึกยอดซื้อและยอดขายแยกกัน</p></div><Link className="button-primary" href="/dashboard/transactions/new?type=investment"><Plus size={16} aria-hidden="true" /> เพิ่มรายการ</Link></div>
    <div className="investment-metrics"><article className="metric-card blue"><span><ArrowUpRight size={16} aria-hidden="true" /> ยอดซื้อที่บันทึก</span><strong>{failed ? "—" : formatTHB(totals.buy)}</strong></article><article className="metric-card green"><span><ArrowDownLeft size={16} aria-hidden="true" /> ยอดขายที่บันทึก</span><strong>{failed ? "—" : formatTHB(totals.sell)}</strong></article></div>
    <p className="small-note">ยอดซื้อและยอดขายเป็นกระแสเงินแยกกัน ไม่ใช่มูลค่าพอร์ตหรือกำไรขาดทุน เพราะยังไม่มีจำนวนหน่วย ต้นทุนคงเหลือ และราคาปัจจุบัน</p>
    <InvestmentSimulator />
    <section className="panel investment-history"><div className="panel-heading"><div><p className="eyebrow">RECORDED ACTIVITY</p><h2>ประวัติลงทุน</h2></div><TrendingUp size={18} aria-hidden="true" /></div>
      {failed ? <p className="notice notice-error">โหลดประวัติลงทุนไม่สำเร็จ</p> : rows.length ? <div className="activity-list">{rows.slice(0, 40).map((row) => <div className="activity-row" key={row.id}><span className={`activity-mark ${row.action?.toLowerCase() === "sell" ? "income" : "expense"}`}>{row.action?.toLowerCase() === "sell" ? <ArrowDownLeft size={16} aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}</span><div className="activity-copy"><strong>{row.description}</strong><small>{formatThaiDate(row.transaction_date)} · {row.category}</small></div><span className={`activity-amount ${row.action?.toLowerCase() === "sell" ? "positive" : ""}`}>{row.action || "ลงทุน"} · {formatTHB(Number(row.amount_thb))}</span></div>)}</div> : <div className="inline-empty"><p>ยังไม่มีรายการลงทุน</p><Link className="button-secondary" href="/dashboard/transactions/new?type=investment">เพิ่มรายการแรก</Link></div>}
    </section>
  </div>;
}

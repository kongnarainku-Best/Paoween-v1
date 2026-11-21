import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { formatTHB, getBangkokMonthRange, getBangkokMonthRangeForKey, getSignedInUser } from "@/lib/finance/server";

type Search = Promise<{ month?: string }>;

export default async function SpendingPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const current = getBangkokMonthRange();
  const month = getBangkokMonthRangeForKey(params.month, new Date(`${current.start}T00:00:00.000Z`));
  const { supabase, userId } = await getSignedInUser();
  const rows: { category: string; amount_thb: number | string }[] = [];
  let offset = 0;
  let failed = false;
  while (true) {
    const result = await supabase.from("transactions").select("category,amount_thb")
      .eq("user_id", userId).eq("transaction_type", "expense")
      .gte("transaction_date", month.start).lt("transaction_date", month.end)
      .order("transaction_date", { ascending: false }).range(offset, offset + 999);
    if (result.error || !result.data) { failed = true; break; }
    rows.push(...result.data);
    if (result.data.length < 1000) break;
    offset += 1000;
  }
  const groups = [...rows.reduce((map, row) => map.set(row.category, (map.get(row.category) ?? 0) + Number(row.amount_thb)), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const total = groups.reduce((sum, [, amount]) => sum + amount, 0);
  const max = groups[0]?.[1] ?? 1;
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${month.start}T00:00:00.000Z`));

  return <div className="workspace-content">
    <div className="dashboard-heading"><div><p className="eyebrow">SPENDING BREAKDOWN</p><h1>เงินไปไหนบ้าง<span className="period">.</span></h1><p className="muted">รายจ่ายตามหมวดจากรายการบนเว็บของคุณ</p></div></div>
    <form className="period-filter" method="get"><label htmlFor="spending-month">เดือนที่ดู</label><input id="spending-month" type="month" name="month" defaultValue={month.key} /><button className="button-secondary button-small" type="submit">แสดงเดือนนี้</button></form>
    {failed ? <p className="notice notice-error" role="alert">โหลดรายจ่ายไม่สำเร็จ กรุณาลองใหม่</p> : groups.length ? <>
      <section className="spending-total-card"><span><Wallet size={19} aria-hidden="true" /> รายจ่ายรวม · {monthLabel}</span><strong>{formatTHB(total)}</strong><small>นับเฉพาะรายการรายจ่ายที่บันทึกไว้ ไม่รวมการโอนหรือเงินลงทุน</small></section>
      <section className="panel spending-panel" aria-label="รายจ่ายแยกตามหมวด">
        {groups.map(([category, amount], index) => <Link className="spending-category" href={`/dashboard/transactions?month=${month.key}&type=expense&category=${encodeURIComponent(category)}`} key={category}>
          <span className="spending-category-head"><span className="category-index">{String(index + 1).padStart(2, "0")}</span><strong>{category}</strong><span>{formatTHB(amount)}</span></span>
          <span className="spending-bar-track"><i style={{ width: `${Math.max(3, amount / max * 100)}%` }} /></span>
          <span className="spending-category-foot"><small>{total ? (amount / total * 100).toFixed(1) : "0.0"}% ของรายจ่ายเดือนนี้</small><span>ดูรายการ <ArrowRight size={13} aria-hidden="true" /></span></span>
        </Link>)}
      </section>
    </> : <section className="inline-empty"><h2>ยังไม่มีรายจ่ายในเดือนนี้</h2><p>เพิ่มรายการรายจ่าย แล้วเป๋าวีนจะแยกยอดตามหมวดให้</p><Link className="button-secondary" href="/dashboard/transactions/new">เพิ่มรายการ</Link></section>}
  </div>;
}

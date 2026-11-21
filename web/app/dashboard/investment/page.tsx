import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CircleHelp, Plus, TrendingUp } from "lucide-react";
import { InvestmentSimulator } from "@/app/dashboard/investment-simulator";
import { investmentDirectionLabels, summarizeInvestment, type InvestmentDirection } from "@/lib/finance/investment";
import { formatThaiDate, formatTHB, getSignedInUser } from "@/lib/finance/server";

type Row = {
  id: string;
  transaction_date: string;
  description: string;
  amount_thb: number | string;
  category: string;
  investment_direction: InvestmentDirection | null;
};
type Search = Promise<{ page?: string; review?: string }>;
const pageSize = 40;

export default async function InvestmentPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const { supabase, userId } = await getSignedInUser();
  const rows: Row[] = [];
  let offset = 0;
  let failed = false;
  while (true) {
    const result = await supabase.from("transactions").select("id,transaction_date,description,amount_thb,category,investment_direction")
      .eq("user_id", userId).eq("transaction_type", "investment")
      .order("transaction_date", { ascending: false }).order("created_at", { ascending: false })
      .order("id", { ascending: false }).range(offset, offset + 999);
    if (result.error || !result.data) { failed = true; break; }
    rows.push(...result.data as Row[]);
    if (result.data.length < 1000) break;
    offset += 1000;
  }
  const totals = summarizeInvestment(rows);
  const reviewOnly = params.review === "1";
  const filteredRows = reviewOnly ? rows.filter((row) => row.investment_direction === null) : rows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, Number.parseInt(params.page ?? "", 10) || 1));
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const pageHref = (nextPage: number) => `/dashboard/investment?page=${nextPage}${reviewOnly ? "&review=1" : ""}#investment-history`;

  return <div className="workspace-content">
    <div className="dashboard-heading">
      <div><h1>การลงทุนของเรา<span className="period">.</span></h1></div>
      <Link className="button-primary" href="/dashboard/transactions/new?type=investment"><Plus size={16} aria-hidden="true" /> เพิ่มรายการ</Link>
    </div>
    <div className="investment-metrics">
      <article className="metric-card blue">
        <span><ArrowUpRight size={16} aria-hidden="true" /> ยอดซื้อสะสม</span>
        <strong>{failed ? "—" : formatTHB(totals.buy)}</strong>
      </article>
      <article className="metric-card green">
        <span><ArrowDownLeft size={16} aria-hidden="true" /> ยอดขายสะสม</span>
        <strong>{failed ? "—" : formatTHB(totals.sell)}</strong>
      </article>
    </div>
    <InvestmentSimulator />
    <section className="panel investment-history" id="investment-history" aria-labelledby="investment-history-heading">
      <div className="panel-heading">
        <h2 id="investment-history-heading">ประวัติลงทุน</h2><TrendingUp size={18} aria-hidden="true" />
      </div>
      {failed ? <p className="notice notice-error" role="alert">โหลดประวัติลงทุนไม่สำเร็จ</p> : <>
        {(totals.needsReview > 0 || reviewOnly) && <div className="notice notice-warning">
          <span>{totals.needsReview} รายการรอระบุว่าซื้อหรือขาย</span>{" "}
          {reviewOnly
            ? <Link className="text-link" href="/dashboard/investment#investment-history">ดูทั้งหมด</Link>
            : <Link className="text-link" href="/dashboard/investment?review=1#investment-history">ดูรายการรอตรวจ</Link>}
        </div>}
        {visibleRows.length > 0 ? <div className="activity-list">
          {visibleRows.map((row) => {
            const direction = row.investment_direction;
            const Mark = direction === "buy" ? ArrowUpRight : direction === "sell" ? ArrowDownLeft : CircleHelp;
            const label = direction ? investmentDirectionLabels[direction] : "รอระบุซื้อหรือขาย";
            return <Link className="activity-row" href={`/dashboard/transactions/${row.id}/edit`} key={row.id}>
              <span className={`activity-mark ${direction === "sell" ? "income" : direction === "buy" ? "expense" : ""}`}><Mark size={16} aria-hidden="true" /></span>
              <span className="activity-copy"><strong>{row.description}</strong><small>{formatThaiDate(row.transaction_date)} · {row.category} · {label}</small></span>
              <span className={`activity-amount ${direction === "sell" ? "positive" : ""}`}>{formatTHB(row.amount_thb)}</span>
            </Link>;
          })}
        </div> : !reviewOnly && <div className="inline-empty">
          <p>ยังไม่มีรายการลงทุน</p>
          <Link className="button-secondary" href="/dashboard/transactions/new?type=investment">เพิ่มรายการแรก</Link>
        </div>}
        {pageCount > 1 && <nav className="pagination" aria-label="หน้าประวัติลงทุน">
          <span>หน้า {page} จาก {pageCount}</span>
          <div>
            {page > 1 && <Link className="button-secondary" href={pageHref(page - 1)}>ก่อนหน้า</Link>}
            {page < pageCount && <Link className="button-secondary" href={pageHref(page + 1)}>ถัดไป</Link>}
          </div>
        </nav>}
      </>}
    </section>
  </div>;
}

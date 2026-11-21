import Link from "next/link";
import { formatTHB } from "@/lib/finance/server";

export type MonthSummary = { key: string; label: string; income: number; expense: number };

export function MonthlyTrend({ months }: { months: MonthSummary[] }) {
  const max = Math.max(1, ...months.flatMap((month) => [month.income, month.expense]));
  return <section className="panel trend-panel" aria-labelledby="trend-heading">
    <div className="panel-heading"><div><p className="eyebrow">7-MONTH TREND</p><h2 id="trend-heading">เงินเข้าและเงินออก</h2><p className="muted">เลือกเดือนเพื่อเปิดรายการของเดือนนั้น</p></div>
      <div className="trend-legend"><span><i className="income-bar" />รายรับ</span><span><i className="expense-bar" />รายจ่าย</span></div>
    </div>
    <div className="trend-chart" role="list" aria-label="กราฟรายรับและรายจ่ายรายเดือน">
      {months.map((month) => <Link className="trend-month" href={`/dashboard/transactions?month=${month.key}`} key={month.key} role="listitem" aria-label={`${month.label}: รายรับ ${formatTHB(month.income)}, รายจ่าย ${formatTHB(month.expense)}`}>
        <span className="trend-bars" aria-hidden="true">
          <i className="trend-income" style={{ height: `${Math.max(month.income ? 4 : 0, month.income / max * 100)}%` }} />
          <i className="trend-expense" style={{ height: `${Math.max(month.expense ? 4 : 0, month.expense / max * 100)}%` }} />
        </span>
        <span className="trend-month-label">{month.label}</span>
      </Link>)}
    </div>
    <div className="trend-caption"><span>สูงสุดในกราฟ: {formatTHB(max)}</span><Link className="text-link" href="/dashboard/spending">ดูหมวดรายจ่าย</Link></div>
  </section>;
}

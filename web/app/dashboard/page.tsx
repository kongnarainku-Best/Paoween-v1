import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Plus, ReceiptText } from "lucide-react";

import { currentThaiTaxYear, formatThaiDate, formatTHB, getRecentBangkokMonths, getSignedInUser } from "@/lib/finance/server";
import { summarizeInvestment, type InvestmentDirection } from "@/lib/finance/investment";
import { taxRecordTypeLabels, transactionTypeLabels } from "@/lib/finance/validation";
import { OnboardingSummary } from "@/app/settings/new-user/onboarding-summary";
import { onboardingSessionScope } from "@/lib/finance/onboarding";
import { MonthlySalary } from "@/app/dashboard/monthly-salary";
import { MonthlyTrend, type MonthSummary } from "@/app/dashboard/monthly-trend";

type MonthTransaction = { id: string; transaction_date: string; transaction_type: "income" | "expense" | "investment" | "transfer"; description: string; amount_thb: number | string; category: string };
type DashboardTrendRow = {
  transaction_date: string;
  transaction_type: "income" | "expense" | "investment";
  amount_thb: number | string;
  investment_direction: InvestmentDirection | null;
};
type TaxPreview = { id: string; record_type: string; tax_category: string; amount_thb: number | string | null; review_status: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { supabase, userId, claims } = await getSignedInUser();
  const onboardingScope = onboardingSessionScope(userId, claims);
  const months = getRecentBangkokMonths(7);
  const currentMonth = months.at(-1)!;
  const taxYear = currentThaiTaxYear();
  const loadTrendRows = async () => {
    const rows: DashboardTrendRow[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from("transactions")
        .select("transaction_date,transaction_type,amount_thb,investment_direction")
        .eq("user_id", userId).in("transaction_type", ["income", "expense", "investment"])
        .gte("transaction_date", months[0].start).lt("transaction_date", currentMonth.end)
        .order("transaction_date", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999);
      if (error || !data) return { rows, failed: true };
      rows.push(...data as DashboardTrendRow[]);
      if (data.length < 1000) return { rows, failed: false };
      offset += 1000;
    }
  };
  const [trendResult, recentResult, taxResult] = await Promise.all([
    loadTrendRows(),
    supabase.from("transactions")
      .select("id,transaction_date,transaction_type,description,amount_thb,category")
      .eq("user_id", userId).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(6),
    supabase.from("tax_records")
      .select("id,record_type,tax_category,amount_thb,review_status", { count: "exact" })
      .eq("user_id", userId).eq("tax_year", taxYear).order("created_at", { ascending: false }).limit(4),
  ]);
  const { data: recentData, error: recentError } = recentResult;
  const { data: taxData, count: taxCount, error: taxError } = taxResult;

  const sums = { income: 0, expense: 0 };
  const monthlyTotals = new Map(months.map((month) => [month.key, { income: 0, expense: 0 }]));
  const monthlyInvestments: DashboardTrendRow[] = [];
  for (const row of trendResult.rows) {
    const amount = Number(row.amount_thb);
    const monthKey = row.transaction_date.slice(0, 7);
    if (monthKey === currentMonth.key && row.transaction_type === "income") sums.income += amount;
    if (monthKey === currentMonth.key && row.transaction_type === "expense") sums.expense += amount;
    if (monthKey === currentMonth.key && row.transaction_type === "investment") monthlyInvestments.push(row);
    const monthly = monthlyTotals.get(monthKey);
    if (monthly && row.transaction_type === "income") monthly.income += amount;
    if (monthly && row.transaction_type === "expense") monthly.expense += amount;
  }
  const investmentTotals = summarizeInvestment(monthlyInvestments);
  const monthlyTrend: MonthSummary[] = months.map((month) => ({ ...month, ...monthlyTotals.get(month.key)! }));
  const recent = (recentData ?? []) as MonthTransaction[];
  const taxRecords = (taxData ?? []) as TaxPreview[];
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${currentMonth.key}-01T00:00:00.000Z`));

  return <div className="workspace-content dashboard-home">
    <OnboardingSummary key={onboardingScope} scope={onboardingScope} />
    <section className="dashboard-welcome" aria-labelledby="welcome-heading">
      <div className="dashboard-welcome-copy">
        <p className="eyebrow">ภาพรวมการเงินส่วนตัว</p>
        <h1 id="welcome-heading">จัดการเงินของคุณในที่เดียว</h1>
        <p className="welcome-tagline">คุยกับเป๋าวีนเพื่อวิเคราะห์และร่างรายการได้ทุกเมื่อ</p>
        <p className="welcome-period">ภาพรวมเดือน {monthLabel}</p>
        <div className="pocket-heading-actions">
          <Link className="button-primary" href="/dashboard/transactions/new"><Plus size={17} aria-hidden="true" /> {recent.length || recentError ? "เพิ่มรายการ" : "เพิ่มรายการแรก"}</Link>
          <Link className="button-secondary" href="/dashboard/pockets">ดูยอดกระเป๋า</Link>
        </div>
      </div>
    </section>

    {saved === "income" && <p className="notice notice-success" role="status">บันทึกรายรับแล้ว</p>}
    <section className="metric-grid" aria-label="สรุปรายการเดือนนี้">
      <Metric label="รายรับ" value={trendResult.failed ? null : sums.income} accent="green" icon={<ArrowDownLeft size={17} aria-hidden="true" />} />
      <Metric label="รายจ่าย" value={trendResult.failed ? null : sums.expense} accent="amber" icon={<ArrowUpRight size={17} aria-hidden="true" />} />
      <article className="metric-card blue">
        <div className="metric-label">
          <Link href="/dashboard/investment" className="text-link">ลงทุน</Link>
          <span><ReceiptText size={17} aria-hidden="true" /></span>
        </div>
        <dl className="metric-investment">
          <div><dt>ซื้อ</dt><dd>{formatTHB(trendResult.failed ? null : investmentTotals.buy)}</dd></div>
          <div><dt>ขาย</dt><dd>{formatTHB(trendResult.failed ? null : investmentTotals.sell)}</dd></div>
        </dl>
      </article>
      <Metric label="คงเหลือจากรายรับ/รายจ่าย" value={trendResult.failed ? null : sums.income - sums.expense} accent="neutral" />
    </section>
    {trendResult.failed && <p className="notice notice-error" role="alert">โหลดข้อมูลสรุปไม่ครบ กรุณาโหลดหน้านี้ใหม่</p>}
    <p className="small-note">ยอดรายรับ รายจ่าย และซื้อขายลงทุนอิงรายการที่คุณบันทึกในเดือนนี้</p>

    <MonthlySalary key={userId} userId={userId} />

    {!trendResult.failed && <MonthlyTrend months={monthlyTrend} />}

    <div className="dashboard-columns">
      <section className="panel" aria-labelledby="recent-heading">
        <div className="panel-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2 id="recent-heading">รายการล่าสุด</h2></div><Link className="text-link" href="/dashboard/transactions">ดูทั้งหมด <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
        {recentError ? <p className="notice notice-error" role="alert">โหลดรายการล่าสุดไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่</p> : recent.length ? <div className="activity-list">{recent.map((row) => <div className="activity-row" key={row.id}>
          <span className={`activity-mark ${row.transaction_type}`}>{row.transaction_type === "income" ? <ArrowDownLeft size={16} aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}</span>
          <div className="activity-copy"><strong>{row.description}</strong><small>{formatThaiDate(row.transaction_date)} · {row.category} · {transactionTypeLabels[row.transaction_type]}</small></div>
          <span className={`activity-amount ${row.transaction_type === "income" ? "positive" : ""}`}>{row.transaction_type === "income" ? "+" : row.transaction_type === "expense" ? "−" : ""}{formatTHB(Number(row.amount_thb))}</span>
        </div>)}</div> : <div className="inline-empty"><p>ยังไม่มีรายการ</p><span>เริ่มบันทึกรายรับ รายจ่าย หรือการลงทุนได้เลย</span><Link className="button-secondary" href="/dashboard/transactions/new"><Plus size={16} aria-hidden="true" /> เพิ่มรายการแรก</Link></div>}
      </section>

      <section className="panel tax-preview" aria-labelledby="tax-heading">
        <div className="panel-heading"><div><p className="eyebrow">TAX PREPARATION</p><h2 id="tax-heading">เตรียมภาษี {taxYear}</h2></div><Link className="text-link" href="/dashboard/tax">เปิดหน้า <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
        {taxError ? <p className="notice notice-error" role="alert">โหลดรายการภาษีไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่</p> : <>
        <div className="tax-summary"><strong>{taxCount ?? 0}</strong><span>รายการในปีภาษีนี้</span></div>
        {taxRecords.length ? <div className="tax-preview-list">{taxRecords.map((record) => <div className="tax-preview-row" key={record.id}>
          <span><strong>{record.tax_category}</strong><small>{taxRecordTypeLabels[record.record_type as keyof typeof taxRecordTypeLabels] ?? record.record_type}</small></span>
          <span className="right-value">{record.amount_thb === null ? "ยังไม่ทราบ" : formatTHB(record.amount_thb)}<small>{record.review_status === "confirmed" ? "ยืนยันแล้ว" : record.review_status === "rejected" ? "ไม่รับรายการ" : "รอตรวจสอบ"}</small></span>
        </div>)}</div> : <div className="tax-empty">บันทึกหลักฐานและรายการภาษีไว้ในที่เดียว โดยตรวจเอกสารก่อนยืนยันเสมอ</div>}
        <Link className="button-secondary button-wide" href="/dashboard/tax/new"><Plus size={16} aria-hidden="true" /> เพิ่มรายการภาษี</Link>
        </>}
      </section>
    </div>
    <footer className="workspace-footer">เริ่มต้นด้วยข้อมูลว่างเปล่า · ข้อมูลจากเครื่องของคุณไม่ได้ถูกนำเข้ามา</footer>
  </div>;
}

function Metric({ label, value, accent, icon }: { label: string; value: number | null; accent: string; icon?: React.ReactNode }) {
  return <article className={`metric-card ${accent}`}><div className="metric-label">{label}{icon && <span>{icon}</span>}</div><strong>{formatTHB(value)}</strong></article>;
}

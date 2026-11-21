import Link from "next/link";

import { bangkokDate } from "@/lib/finance/pocket";
import { formatThaiDate, formatTHB, getSignedInUser } from "@/lib/finance/server";
import { isoDate } from "@/lib/finance/validation";
import { PocketForm } from "./pocket-form";

type Balance = { id: string; name: string; opening_date: string; opening_balance_thb: string | number; balance_thb: string | number | null };

export default async function PocketsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const today = bangkokDate();
  const asOf = typeof date === "string" && date <= today && isoDate.safeParse(date).success ? date : today;
  const { supabase } = await getSignedInUser();
  const balances: Balance[] = [];
  const limit = 500;
  let failed = false;
  for (let start = 0; ; start += limit) {
    const { data, error } = await supabase.rpc("pocket_balances", { p_as_of: asOf }).order("opening_date").order("id").range(start, start + limit - 1);
    if (error) {
      failed = true;
      break;
    }
    balances.push(...data);
    if (data.length < limit) break;
  }
  // Sum in satang so the total is stable when adding decimal balances.
  const total = balances.reduce((sum, row) => sum + Math.round(Number(row.balance_thb ?? 0) * 100), 0) / 100;

  return <div className="workspace-content">
    <div className="dashboard-heading"><div><h1>กระเป๋าเงิน<span className="period">.</span></h1><p className="muted">ดูยอดจากเงินสด บัญชีธนาคาร และกระเป๋าที่คุณบันทึกไว้</p></div><Link className="button-secondary" href="/dashboard/transactions">ดูรายการทั้งหมด</Link></div>
    <form className="year-filter pocket-balance-filter" action="/dashboard/pockets">
      <label htmlFor="pocket-balance-date">ยอดถึงวันที่</label>
      <input id="pocket-balance-date" name="date" type="date" max={today} defaultValue={asOf} required />
      <button className="button-secondary" type="submit">แสดงยอด</button>
    </form>
    {failed ? <p className="notice notice-error" role="alert">โหลดยอดกระเป๋าไม่สำเร็จ กรุณาลองอีกครั้ง</p> : balances.length > 0 ? <>
      <div className="metric-card green pocket-balance-total"><span>ยอดรวมกระเป๋าที่ติดตาม</span><strong>{formatTHB(total)}</strong></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>กระเป๋า</th><th>ยอดตั้งต้น</th><th className="numeric">ยอดคงเหลือ</th><th>ประวัติ</th></tr></thead><tbody>
        {balances.map((row) => <tr key={row.id} data-pocket-id={row.id}>
          <td data-label="กระเป๋า"><strong>{row.name}</strong><small className="table-subline">เริ่ม {formatThaiDate(row.opening_date)}</small></td>
          <td data-label="ยอดตั้งต้น">{formatTHB(row.opening_balance_thb)}</td>
          <td className="numeric" data-label="ยอดคงเหลือ">{row.balance_thb === null ? "ยังไม่เริ่มติดตาม" : formatTHB(row.balance_thb)}</td>
          <td data-label="ประวัติ"><Link className="text-link" href={`/dashboard/transactions?pocket=${row.id}`}>ดูรายการ<span className="sr-only"> {row.name}</span></Link></td>
        </tr>)}
      </tbody></table></div>
    </> : <p className="muted">ยังไม่มีกระเป๋า เริ่มจากบัญชีที่คุณใช้จ่ายบ่อยที่สุดได้เลย</p>}
    <PocketForm today={today} />
  </div>;
}

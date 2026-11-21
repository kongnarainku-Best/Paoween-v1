import Link from "next/link";
import { ArrowLeft, ArrowRight, Pencil, Plus, Wallet } from "lucide-react";

import { deleteTransactionAction } from "@/app/dashboard/actions";
import { formatThaiDate, formatTHB, getBangkokMonthRangeForKey, getSignedInUser } from "@/lib/finance/server";
import { listPocketOptions } from "@/lib/finance/pocket-server";
import { transactionCategories, transactionTypeLabels } from "@/lib/finance/validation";

type Search = Promise<{ page?: string; saved?: string; error?: string; month?: string; q?: string; type?: string; category?: string; pocket?: string }>;
const pageSize = 25;

export default async function TransactionsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  const { supabase, userId } = await getSignedInUser();
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month : "";
  const month = monthKey ? getBangkokMonthRangeForKey(monthKey) : null;
  const query = (params.q ?? "").trim().slice(0, 80);
  const type = ["income", "expense", "investment", "transfer"].includes(params.type ?? "") ? params.type : "";
  const category = transactionCategories.includes(params.category ?? "") ? params.category : "";
  const pockets = await listPocketOptions(supabase, userId);
  const pocketNames = new Map(pockets.map(({ id, name }) => [id, name]));
  const requestedPocket = typeof params.pocket === "string" ? params.pocket : "";
  const pocket = requestedPocket === "unassigned" || pocketNames.has(requestedPocket) ? requestedPocket : "";
  const from = (page - 1) * pageSize;
  let request = supabase.from("transactions").select("id,transaction_date,transaction_type,description,amount_thb,category,action,investment_direction,pocket_id,destination_pocket_id", { count: "exact" }).eq("user_id", userId);
  if (month) request = request.gte("transaction_date", month.start).lt("transaction_date", month.end);
  if (pocket === "unassigned") request = request.is("pocket_id", null);
  else if (pocket) request = request.or(`pocket_id.eq.${pocket},destination_pocket_id.eq.${pocket}`);
  if (type) request = request.eq("transaction_type", type);
  if (category) request = request.eq("category", category);
  if (query) request = request.ilike("description", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, count, error } = await request.order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + pageSize - 1);
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const notices: Record<string, string> = { created: "เพิ่มรายการแล้ว", updated: "บันทึกการแก้ไขแล้ว", deleted: "ลบรายการแล้ว" };
  const errors: Record<string, string> = { "delete-confirmation": "ต้องยืนยันการลบก่อน", "delete-failed": "ลบรายการไม่สำเร็จ กรุณาลองใหม่" };
  const filterParams = new URLSearchParams();
  if (monthKey) filterParams.set("month", monthKey);
  if (query) filterParams.set("q", query);
  if (type) filterParams.set("type", type);
  if (category) filterParams.set("category", category);
  if (pocket) filterParams.set("pocket", pocket);
  const filterSuffix = filterParams.toString();

  return <div className="workspace-content">
    <div className="dashboard-heading"><div><p className="eyebrow">YOUR TRANSACTIONS</p><h1>รายรับรายจ่าย<span className="period">.</span></h1><p className="muted">รายการทั้งหมดผูกกับบัญชีที่เข้าสู่ระบบนี้</p></div><div className="pocket-heading-actions"><Link className="button-secondary" href="/dashboard/pockets"><Wallet size={17} aria-hidden="true" /> กระเป๋าเงิน</Link><Link className="button-primary" href="/dashboard/transactions/new"><Plus size={17} aria-hidden="true" /> เพิ่มรายการ</Link></div></div>
    {params.saved && notices[params.saved] && <p className="notice notice-success" role="status">{notices[params.saved]}</p>}
    {params.error && errors[params.error] && <p className="notice notice-error" role="alert">{errors[params.error]}</p>}
    <form className="transaction-filters" method="get">
      <label>ค้นหารายการ<input name="q" type="search" placeholder="ชื่อหรือรายละเอียด" defaultValue={query} /></label>
      <label>เดือน<input name="month" type="month" defaultValue={monthKey} /></label>
      <label>ประเภท<select name="type" defaultValue={type}><option value="">ทุกประเภท</option>{Object.entries(transactionTypeLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>หมวดหมู่<select name="category" defaultValue={category}><option value="">ทุกหมวด</option>{transactionCategories.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>กระเป๋า<select name="pocket" defaultValue={pocket}><option value="">ทุกกระเป๋า</option><option value="unassigned">ยังไม่ระบุกระเป๋า</option>{pockets.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}</select></label>
      <button className="button-secondary button-small" type="submit">กรองรายการ</button>
      {filterSuffix && <Link className="text-link" href="/dashboard/transactions">ล้างตัวกรอง</Link>}
    </form>
    {error ? <p className="notice notice-error" role="alert">โหลดรายการไม่สำเร็จ กรุณาลองโหลดหน้าใหม่</p> : rows.length ? <>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>วันที่</th><th>รายการ</th><th>ประเภท / หมวดหมู่</th><th className="numeric">จำนวนเงิน</th><th><span className="sr-only">การจัดการ</span></th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td data-label="วันที่">{formatThaiDate(row.transaction_date)}</td>
          <td data-label="รายการ"><strong>{row.description}</strong>{row.action && <small className="table-subline">{row.action}</small>}</td>
          <td data-label="ประเภท / หมวดหมู่"><span className="type-label">{transactionTypeLabels[row.transaction_type as keyof typeof transactionTypeLabels] ?? row.transaction_type}</span><small className="table-subline">{row.category}{row.investment_direction === "buy" ? " · ซื้อ" : row.investment_direction === "sell" ? " · ขาย" : ""}</small>
            <small className="table-subline">{pocketNames.get(row.pocket_id) ?? "ยังไม่ระบุกระเป๋า"}{row.destination_pocket_id ? ` → ${pocketNames.get(row.destination_pocket_id) ?? "กระเป๋าปลายทาง"}` : ""}</small></td>
          <td data-label="จำนวนเงิน" className="numeric">{formatTHB(Number(row.amount_thb))}</td>
          <td className="row-actions"><Link className="icon-link" href={`/dashboard/transactions/${row.id}/edit`} aria-label={`แก้ไข ${row.description}`}><Pencil size={16} aria-hidden="true" /></Link>
            <details className="delete-menu"><summary aria-label={`ตัวเลือกลบ ${row.description}`}>•••</summary><form action={deleteTransactionAction} className="delete-confirm-form"><input type="hidden" name="id" value={row.id} /><label><input type="checkbox" name="confirm_delete" value="yes" required /> ยืนยันลบรายการนี้</label><button className="button-danger button-small" type="submit">ลบรายการ</button></form></details>
          </td>
        </tr>)}
      </tbody></table></div>
      <div className="pagination"><span>หน้า {page} จาก {pages} · {count ?? 0} รายการ</span><div>
        {page > 1 && <Link className="button-secondary" href={`/dashboard/transactions?page=${page - 1}${filterSuffix ? `&${filterSuffix}` : ""}`}><ArrowLeft size={15} aria-hidden="true" /> ก่อนหน้า</Link>}
        {page < pages && <Link className="button-secondary" href={`/dashboard/transactions?page=${page + 1}${filterSuffix ? `&${filterSuffix}` : ""}`}>ถัดไป <ArrowRight size={15} aria-hidden="true" /></Link>}
      </div></div>
    </> : <section className="inline-empty"><h2>ยังไม่มีรายการ</h2><p>เริ่มบันทึกรายรับ รายจ่าย การลงทุน หรือการโอนของคุณ</p><Link className="button-primary" href="/dashboard/transactions/new"><Plus size={16} aria-hidden="true" /> เพิ่มรายการแรก</Link></section>}
    <p className="small-note">ถ้าลบธุรกรรมที่เชื่อมกับภาษี รายการภาษีจะยังอยู่และระบบจะตัดลิงก์เดิม</p>
  </div>;
}

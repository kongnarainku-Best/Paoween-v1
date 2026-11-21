import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus, Pencil } from "lucide-react";

import { deleteTaxRecordAction } from "@/app/dashboard/actions";
import { formatTHB, getSignedInUser } from "@/lib/finance/server";
import { currentThaiTaxYear } from "@/lib/finance/server";
import { documentStatusLabels, reviewStatusLabels, taxRecordTypeLabels } from "@/lib/finance/validation";

type Search = Promise<{ page?: string; year?: string; saved?: string; error?: string }>;
const pageSize = 25;

export default async function TaxPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const currentYear = currentThaiTaxYear();
  const selectedYear = Math.max(2400, Math.min(2700, Number.parseInt(params.year ?? String(currentYear), 10) || currentYear));
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  const { supabase, userId } = await getSignedInUser();
  const from = (page - 1) * pageSize;
  const { data, count, error } = await supabase.from("tax_records").select("id,transaction_id,tax_year,record_type,tax_category,amount_thb,source_reference,document_status,review_status,notes", { count: "exact" })
    .eq("user_id", userId).eq("tax_year", selectedYear).order("created_at", { ascending: false }).range(from, from + pageSize - 1);
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const notices: Record<string, string> = { created: "เพิ่มรายการภาษีแล้ว", updated: "บันทึกการแก้ไขแล้ว", deleted: "ลบรายการภาษีแล้ว" };
  const errors: Record<string, string> = { "delete-confirmation": "ต้องยืนยันการลบก่อน", "delete-failed": "ลบรายการภาษีไม่สำเร็จ กรุณาลองใหม่" };

  return <div className="workspace-content">
    <div className="dashboard-heading"><div><p className="eyebrow">TAX PREPARATION</p><h1>เตรียมภาษี<span className="period">.</span></h1><p className="muted">จัดเก็บรายการและหลักฐานพร้อมสถานะตรวจสอบ</p></div><Link className="button-primary" href="/dashboard/tax/new"><Plus size={17} aria-hidden="true" /> เพิ่มรายการ</Link></div>
    <form className="year-filter" action="/dashboard/tax"><label htmlFor="year">ปีภาษี (พ.ศ.)</label><input id="year" name="year" type="number" min="2400" max="2700" step="1" defaultValue={selectedYear} /><button className="button-secondary" type="submit">แสดงรายการ</button><span>ยอดต้นทางและยอดรายการย่อยแสดงแยกกัน ไม่ควรนำมาบวกรวมกัน</span></form>
    {params.saved && notices[params.saved] && <p className="notice notice-success" role="status">{notices[params.saved]}</p>}
    {params.error && errors[params.error] && <p className="notice notice-error" role="alert">{errors[params.error]}</p>}
    {error ? <p className="notice notice-error" role="alert">โหลดรายการภาษีไม่สำเร็จ กรุณาลองโหลดหน้าใหม่</p> : rows.length ? <>
      <div className="table-wrap"><table className="data-table tax-table"><thead><tr><th>รายการภาษี</th><th>ชนิด</th><th>เอกสาร / ตรวจสอบ</th><th className="numeric">จำนวนเงิน</th><th><span className="sr-only">การจัดการ</span></th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td data-label="รายการภาษี"><strong>{row.tax_category}</strong>{row.source_reference && <small className="table-subline">{row.source_reference}</small>}</td>
          <td data-label="ชนิด"><span className="type-label">{taxRecordTypeLabels[row.record_type as keyof typeof taxRecordTypeLabels] ?? row.record_type}</span>{row.notes && <small className="table-subline">{row.notes}</small>}</td>
          <td data-label="เอกสาร / ตรวจสอบ"><span className="status-chip">{documentStatusLabels[row.document_status as keyof typeof documentStatusLabels] ?? row.document_status}</span><small className="table-subline">{reviewStatusLabels[row.review_status as keyof typeof reviewStatusLabels] ?? row.review_status}</small></td>
          <td data-label="จำนวนเงิน" className="numeric">{formatTHB(row.amount_thb)}</td>
          <td className="row-actions"><Link className="icon-link" href={`/dashboard/tax/${row.id}/edit`} aria-label={`แก้ไข ${row.tax_category}`}><Pencil size={16} aria-hidden="true" /></Link>
            <details className="delete-menu"><summary aria-label={`ตัวเลือกลบ ${row.tax_category}`}>•••</summary><form action={deleteTaxRecordAction} className="delete-confirm-form"><input type="hidden" name="id" value={row.id} /><label><input type="checkbox" name="confirm_delete" value="yes" required /> ยืนยันลบรายการนี้</label><button className="button-danger button-small" type="submit">ลบรายการ</button></form></details>
          </td>
        </tr>)}
      </tbody></table></div>
      <div className="pagination"><span>หน้า {page} จาก {pages} · {count ?? 0} รายการ</span><div>
        {page > 1 && <Link className="button-secondary" href={`/dashboard/tax?year=${selectedYear}&page=${page - 1}`}><ArrowLeft size={15} aria-hidden="true" /> ก่อนหน้า</Link>}
        {page < pages && <Link className="button-secondary" href={`/dashboard/tax?year=${selectedYear}&page=${page + 1}`}>ถัดไป <ArrowRight size={15} aria-hidden="true" /></Link>}
      </div></div>
    </> : <section className="inline-empty"><h2>ยังไม่มีรายการภาษีสำหรับปี {selectedYear}</h2><p>บันทึกรายได้ ภาษีที่จ่าย หรือรายการที่ต้องตรวจเอกสาร โดยยังไม่ถือว่ายืนยันสิทธิลดหย่อน</p><Link className="button-primary" href={`/dashboard/tax/new?year=${selectedYear}`}><Plus size={16} aria-hidden="true" /> เพิ่มรายการแรก</Link></section>}
  </div>;
}

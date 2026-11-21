"use client";

import { useActionState, useEffect, useRef } from "react";

import { createTaxRecordAction, updateTaxRecordAction } from "@/app/dashboard/actions";
import { emptyFinanceFormState } from "@/lib/finance/form-state";
import { documentStatusLabels, reviewStatusLabels, taxRecordTypeLabels, type TaxRecordInput } from "@/lib/finance/validation";

type TaxRecord = TaxRecordInput & { id: string };
type LinkedTransaction = { id: string; transaction_date: string; description: string; amount_thb: number | string };

export function TaxRecordForm({ record, transactions, currentYear }: { record?: TaxRecord; transactions: LinkedTransaction[]; currentYear: number }) {
  const action = record ? updateTaxRecordAction : createTaxRecordAction;
  const [state, formAction, pending] = useActionState(action, emptyFinanceFormState);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) errorRef.current?.focus(); }, [state.error]);

  return <form className="form-card" action={formAction} noValidate>
    {record && <input type="hidden" name="id" value={record.id} />}
    {state.error && <div className="form-error-summary" role="alert" tabIndex={-1} ref={errorRef}><strong>บันทึกไม่สำเร็จ</strong><p>{state.error}</p></div>}
    <div className="form-grid">
      <Field label="ปีภาษี (พ.ศ.)" name="tax_year" error={state.fieldErrors.tax_year}>
        <input id="tax_year" name="tax_year" type="number" min="2400" max="2700" step="1" defaultValue={record?.tax_year ?? currentYear} required aria-invalid={!!state.fieldErrors.tax_year} aria-describedby={state.fieldErrors.tax_year ? "error-tax_year" : undefined} />
      </Field>
      <Field label="ชนิดรายการ" name="record_type" error={state.fieldErrors.record_type}>
        <select id="record_type" name="record_type" defaultValue={record?.record_type ?? "income"} required aria-invalid={!!state.fieldErrors.record_type} aria-describedby={state.fieldErrors.record_type ? "error-record_type" : undefined}>
          {Object.entries(taxRecordTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="ชื่อรายการ / หมวดภาษี" name="tax_category" error={state.fieldErrors.tax_category}>
        <input id="tax_category" name="tax_category" type="text" maxLength={120} defaultValue={record?.tax_category ?? ""} placeholder="เช่น เงินเดือน ม.40(1)" required aria-invalid={!!state.fieldErrors.tax_category} aria-describedby={state.fieldErrors.tax_category ? "error-tax_category" : undefined} />
      </Field>
      <Field label="จำนวนเงิน (บาท)" name="amount_thb" error={state.fieldErrors.amount_thb}>
        <input id="amount_thb" name="amount_thb" type="number" inputMode="decimal" min="0" step="0.01" max="999999999999.99" defaultValue={record?.amount_thb ?? ""} placeholder="เว้นว่างหากยังไม่มีหลักฐาน" aria-invalid={!!state.fieldErrors.amount_thb} aria-describedby={state.fieldErrors.amount_thb ? "error-amount_thb" : undefined} />
      </Field>
      <Field label="รายการในบัญชี (ไม่บังคับ)" name="transaction_id" error={state.fieldErrors.transaction_id}>
        <select id="transaction_id" name="transaction_id" defaultValue={record?.transaction_id ?? ""} aria-invalid={!!state.fieldErrors.transaction_id} aria-describedby={state.fieldErrors.transaction_id ? "error-transaction_id" : undefined}>
          <option value="">ไม่เชื่อมกับรายการ</option>
          {transactions.map((row) => <option value={row.id} key={row.id}>{row.transaction_date} · {row.description} · {Number(row.amount_thb).toFixed(2)}</option>)}
        </select>
      </Field>
      <Field label="สถานะเอกสาร" name="document_status" error={state.fieldErrors.document_status}>
        <select id="document_status" name="document_status" defaultValue={record?.document_status ?? "missing"} required aria-invalid={!!state.fieldErrors.document_status} aria-describedby={state.fieldErrors.document_status ? "error-document_status" : undefined}>
          {Object.entries(documentStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="สถานะตรวจสอบ" name="review_status" error={state.fieldErrors.review_status}>
        <select id="review_status" name="review_status" defaultValue={record?.review_status ?? "needs_review"} required aria-invalid={!!state.fieldErrors.review_status} aria-describedby={state.fieldErrors.review_status ? "error-review_status" : undefined}>
          {Object.entries(reviewStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="แหล่งอ้างอิง" name="source_reference" error={state.fieldErrors.source_reference}>
        <input id="source_reference" name="source_reference" type="text" maxLength={500} defaultValue={record?.source_reference ?? ""} placeholder="เอกสารหรือแหล่งที่มา" aria-invalid={!!state.fieldErrors.source_reference} aria-describedby={state.fieldErrors.source_reference ? "error-source_reference" : undefined} />
      </Field>
      <Field label="หมายเหตุ" name="notes" error={state.fieldErrors.notes}>
        <textarea id="notes" name="notes" rows={4} maxLength={2000} defaultValue={record?.notes ?? ""} placeholder="บันทึกข้อสังเกตหรือสิ่งที่ต้องตรวจ" aria-invalid={!!state.fieldErrors.notes} aria-describedby={state.fieldErrors.notes ? "error-notes" : undefined} />
      </Field>
    </div>
    <p className="small-note form-note">รายการภาษีเป็นเพียงบันทึกเตรียมเอกสาร ไม่ได้ยืนยันว่าหักลดหย่อนได้ โปรดตรวจเอกสารและกฎของปีภาษีนั้นก่อน</p>
    <div className="form-actions"><a className="button-secondary" href="/dashboard/tax">ยกเลิก</a><button className="button-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : record ? "บันทึกการแก้ไข" : "บันทึกรายการภาษี"}</button></div>
  </form>;
}

function Field({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return <div className="form-field"><label htmlFor={name}>{label}</label>{children}{error && <span className="field-error" id={`error-${name}`}>{error}</span>}</div>;
}

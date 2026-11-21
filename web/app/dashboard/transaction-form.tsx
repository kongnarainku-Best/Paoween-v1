"use client";

import { useActionState, useEffect, useRef } from "react";

import { createTransactionAction, updateTransactionAction } from "@/app/dashboard/actions";
import { emptyFinanceFormState } from "@/lib/finance/form-state";
import { transactionCategories, transactionTypeLabels, type TransactionInput } from "@/lib/finance/validation";

type TransactionRecord = TransactionInput & { id: string };

export function TransactionForm({ record, initialType }: { record?: TransactionRecord; initialType?: TransactionInput["transaction_type"] }) {
  const action = record ? updateTransactionAction : createTransactionAction;
  const [state, formAction, pending] = useActionState(action, emptyFinanceFormState);
  const errorRef = useRef<HTMLDivElement>(null);
  const todayParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const today = `${todayParts.find((part) => part.type === "year")?.value}-${todayParts.find((part) => part.type === "month")?.value}-${todayParts.find((part) => part.type === "day")?.value}`;
  useEffect(() => { if (state.error) errorRef.current?.focus(); }, [state.error]);

  return <form className="form-card" action={formAction} noValidate>
    {record && <input type="hidden" name="id" value={record.id} />}
    {state.error && <div className="form-error-summary" role="alert" tabIndex={-1} ref={errorRef}><strong>บันทึกไม่สำเร็จ</strong><p>{state.error}</p></div>}
    <div className="form-grid">
      <Field label="วันที่" name="transaction_date" error={state.fieldErrors.transaction_date}>
        <input id="transaction_date" name="transaction_date" type="date" defaultValue={record?.transaction_date ?? today} required aria-invalid={!!state.fieldErrors.transaction_date} aria-describedby={state.fieldErrors.transaction_date ? "error-transaction_date" : undefined} />
      </Field>
      <Field label="ประเภทรายการ" name="transaction_type" error={state.fieldErrors.transaction_type}>
        <select id="transaction_type" name="transaction_type" defaultValue={record?.transaction_type ?? initialType ?? "expense"} required aria-invalid={!!state.fieldErrors.transaction_type} aria-describedby={state.fieldErrors.transaction_type ? "error-transaction_type" : undefined}>
          {Object.entries(transactionTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="รายละเอียด" name="description" error={state.fieldErrors.description}>
        <input id="description" name="description" type="text" maxLength={240} defaultValue={record?.description ?? ""} placeholder="เช่น ค่าอาหารกลางวัน" required aria-invalid={!!state.fieldErrors.description} aria-describedby={state.fieldErrors.description ? "error-description" : undefined} />
      </Field>
      <Field label="จำนวนเงิน (บาท)" name="amount_thb" error={state.fieldErrors.amount_thb}>
        <input id="amount_thb" name="amount_thb" type="number" inputMode="decimal" min="0.01" step="0.01" max="999999999999.99" defaultValue={record?.amount_thb ?? ""} placeholder="0.00" required aria-invalid={!!state.fieldErrors.amount_thb} aria-describedby={state.fieldErrors.amount_thb ? "error-amount_thb" : undefined} />
      </Field>
      <Field label="หมวดหมู่" name="category" error={state.fieldErrors.category}>
        <input id="category" name="category" type="text" list="transaction-categories" maxLength={80} defaultValue={record?.category ?? ""} placeholder="เลือกหรือพิมพ์หมวดหมู่" required aria-invalid={!!state.fieldErrors.category} aria-describedby={state.fieldErrors.category ? "error-category" : undefined} />
        <datalist id="transaction-categories">{transactionCategories.map((category) => <option key={category} value={category} />)}</datalist>
      </Field>
      <Field label="บันทึกเพิ่มเติม (ไม่บังคับ)" name="action" error={state.fieldErrors.action}>
        <input id="action" name="action" type="text" maxLength={240} defaultValue={record?.action ?? ""} placeholder="หมายเหตุส่วนตัว" aria-invalid={!!state.fieldErrors.action} aria-describedby={state.fieldErrors.action ? "error-action" : undefined} />
      </Field>
    </div>
    {state.duplicate && <label className="check-row duplicate-confirm"><input type="checkbox" name="allow_duplicate" value="yes" /> ฉันตรวจแล้วและต้องการบันทึกรายการนี้แม้รายละเอียดจะซ้ำ</label>}
    <div className="form-actions"><a className="button-secondary" href="/dashboard/transactions">ยกเลิก</a><button className="button-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : record ? "บันทึกการแก้ไข" : "บันทึกรายการ"}</button></div>
  </form>;
}

function Field({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return <div className="form-field"><label htmlFor={name}>{label}</label>{children}{error && <span className="field-error" id={`error-${name}`}>{error}</span>}</div>;
}

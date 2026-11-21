"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createTransactionAction, updateTransactionAction } from "@/app/dashboard/actions";
import { PocketSelect } from "@/app/dashboard/pockets/pocket-fields";
import { pocketLabel, type PocketOption } from "@/lib/finance/pocket";
import { emptyFinanceFormState } from "@/lib/finance/form-state";
import { transactionCategories, transactionTypeLabels, type TransactionInput } from "@/lib/finance/validation";

type TransactionRecord = TransactionInput & { id: string };

export function TransactionForm({ record, initialType, submissionId, pockets, today }: {
  record?: TransactionRecord;
  initialType?: TransactionInput["transaction_type"];
  submissionId?: string;
  pockets: PocketOption[];
  today: string;
}) {
  const action = record ? updateTransactionAction : createTransactionAction;
  const [state, formAction, pending] = useActionState(action, emptyFinanceFormState);
  const errorRef = useRef<HTMLDivElement>(null);
  const [fields, setFields] = useState({
    transaction_date: record?.transaction_date ?? today,
    transaction_type: record?.transaction_type ?? initialType ?? "expense",
    description: record?.description ?? "",
    amount_thb: record?.amount_thb?.toString() ?? "",
    category: record?.category ?? "",
    action: record?.action ?? "",
    investment_direction: record?.investment_direction ?? "",
    pocket_id: record?.pocket_id ?? "",
    destination_pocket_id: record?.destination_pocket_id ?? "",
  });

  function change(field: keyof typeof fields, value: string) {
    setFields((current) => ({
      ...current,
      [field]: value,
      ...(field === "pocket_id" && value === current.destination_pocket_id ? { destination_pocket_id: "" } : {}),
    }));
  }

  useEffect(() => { if (state.error) errorRef.current?.focus(); }, [state.error]);

  return <form className="form-card" action={formAction} noValidate>
    {record ? <input type="hidden" name="id" value={record.id} /> : <input type="hidden" name="submission_id" value={submissionId} />}
    {state.error && <div className="form-error-summary" role="alert" tabIndex={-1} ref={errorRef}><strong>บันทึกไม่สำเร็จ</strong><p>{state.error}</p></div>}
    <div className="form-grid">
      <Field label="วันที่" name="transaction_date" error={state.fieldErrors.transaction_date}>
        <input id="transaction_date" name="transaction_date" type="date" value={fields.transaction_date} onChange={(event) => change("transaction_date", event.target.value)} required aria-invalid={!!state.fieldErrors.transaction_date} aria-describedby={state.fieldErrors.transaction_date ? "error-transaction_date" : undefined} />
      </Field>
      <Field label="ประเภทรายการ" name="transaction_type" error={state.fieldErrors.transaction_type}>
        <select id="transaction_type" name="transaction_type" value={fields.transaction_type} onChange={(event) => change("transaction_type", event.target.value)} required aria-invalid={!!state.fieldErrors.transaction_type} aria-describedby={state.fieldErrors.transaction_type ? "error-transaction_type" : undefined}>
          {Object.entries(transactionTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="รายละเอียด" name="description" error={state.fieldErrors.description}>
        <input id="description" name="description" type="text" maxLength={240} value={fields.description} onChange={(event) => change("description", event.target.value)} placeholder="เช่น ค่าอาหารกลางวัน" required aria-invalid={!!state.fieldErrors.description} aria-describedby={state.fieldErrors.description ? "error-description" : undefined} />
      </Field>
      <Field label="จำนวนเงิน (บาท)" name="amount_thb" error={state.fieldErrors.amount_thb}>
        <input id="amount_thb" name="amount_thb" type="number" inputMode="decimal" min="0.01" step="0.01" max="999999999999.99" value={fields.amount_thb} onChange={(event) => change("amount_thb", event.target.value)} placeholder="0.00" required aria-invalid={!!state.fieldErrors.amount_thb} aria-describedby={state.fieldErrors.amount_thb ? "error-amount_thb" : undefined} />
      </Field>
      <Field label="หมวดหมู่" name="category" error={state.fieldErrors.category}>
        <input id="category" name="category" type="text" list="transaction-categories" maxLength={80} value={fields.category} onChange={(event) => change("category", event.target.value)} placeholder="เลือกหรือพิมพ์หมวดหมู่" required aria-invalid={!!state.fieldErrors.category} aria-describedby={state.fieldErrors.category ? "error-category" : undefined} />
        <datalist id="transaction-categories">{transactionCategories.map((category) => <option key={category} value={category} />)}</datalist>
      </Field>
      {fields.transaction_type === "investment" && <Field label="ซื้อหรือขาย" name="investment_direction" error={state.fieldErrors.investment_direction}>
        <select id="investment_direction" name="investment_direction" value={fields.investment_direction} onChange={(event) => change("investment_direction", event.target.value)} required aria-invalid={!!state.fieldErrors.investment_direction} aria-describedby={state.fieldErrors.investment_direction ? "error-investment_direction" : undefined}>
          <option value="">เลือกซื้อหรือขาย</option><option value="buy">ซื้อ</option><option value="sell">ขาย</option>
        </select>
      </Field>}
      <Field label={pocketLabel(fields.transaction_type, fields.investment_direction)} name="pocket_id" error={state.fieldErrors.pocket_id}>
        <PocketSelect id="pocket_id" name="pocket_id" options={pockets} value={fields.pocket_id} onChange={(event) => change("pocket_id", event.target.value)} emptyLabel={fields.transaction_type === "transfer" ? "เลือกต้นทาง" : undefined} required={fields.transaction_type === "transfer"} aria-invalid={!!state.fieldErrors.pocket_id} aria-describedby={state.fieldErrors.pocket_id ? "error-pocket_id" : undefined} />
        {!pockets.length && <a className="text-link" href="/dashboard/pockets">สร้างกระเป๋า</a>}
      </Field>
      {fields.transaction_type === "transfer" && <Field label="กระเป๋าปลายทาง" name="destination_pocket_id" error={state.fieldErrors.destination_pocket_id}>
        <PocketSelect id="destination_pocket_id" name="destination_pocket_id" options={pockets.filter((pocket) => pocket.id !== fields.pocket_id)} value={fields.destination_pocket_id} onChange={(event) => change("destination_pocket_id", event.target.value)} emptyLabel="เลือกปลายทาง" required aria-invalid={!!state.fieldErrors.destination_pocket_id} aria-describedby={state.fieldErrors.destination_pocket_id ? "error-destination_pocket_id" : undefined} />
        {pockets.length < 2 && <a className="text-link" href="/dashboard/pockets">เพิ่มให้ครบสองกระเป๋า</a>}
      </Field>}
      <Field label="บันทึกเพิ่มเติม (ไม่บังคับ)" name="action" error={state.fieldErrors.action}>
        <input id="action" name="action" type="text" maxLength={240} value={fields.action} onChange={(event) => change("action", event.target.value)} placeholder="หมายเหตุส่วนตัว" aria-invalid={!!state.fieldErrors.action} aria-describedby={state.fieldErrors.action ? "error-action" : undefined} />
      </Field>
    </div>
    {state.duplicate && <label className="check-row duplicate-confirm"><input type="checkbox" name="allow_duplicate" value="yes" /> ฉันตรวจแล้วและต้องการบันทึกรายการนี้แม้รายละเอียดจะซ้ำ</label>}
    <div className="form-actions"><a className="button-secondary" href="/dashboard/transactions">ยกเลิก</a><button className="button-primary" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : record ? "บันทึกการแก้ไข" : "บันทึกรายการ"}</button></div>
  </form>;
}

function Field({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return <div className="form-field"><label htmlFor={name}>{label}</label>{children}{error && <span className="field-error" id={`error-${name}`}>{error}</span>}</div>;
}

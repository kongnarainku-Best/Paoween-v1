"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { monthlySalaryInputError, monthlySalaryStorageError, monthlySalaryStorageKey, parseMonthlySalary, readMonthlySalary, setMonthlySalary } from "@/lib/finance/monthly-salary";

const formatAmount = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });

export function MonthlySalary({ userId }: { userId: string }) {
  const [amount, setAmount] = useState<number | null>();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const key = monthlySalaryStorageKey(userId);

    function read() {
      try {
        setAmount(readMonthlySalary(userId));
      } catch {
        setError(monthlySalaryStorageError);
      }
    }

    function sync(event: StorageEvent) {
      if (event.key === key || event.key === null) read();
    }

    read();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [userId]);

  function closeEditor() {
    setEditing(false);
    setError("");
    editButton.current?.focus();
  }

  function save(value: number | null) {
    try {
      setMonthlySalary(userId, value);
      setAmount(value);
      closeEditor();
    } catch {
      setError(monthlySalaryStorageError);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseMonthlySalary(input);
    if (value === null) {
      setError(monthlySalaryInputError);
      return;
    }
    save(value);
  }

  return <section className="panel monthly-salary" aria-labelledby="monthly-salary-heading">
    <div className="monthly-salary-heading">
      <div>
        <h2 id="monthly-salary-heading">เงินเดือนสุทธิต่อเดือน</h2>
        <p aria-live="polite">{typeof amount === "number" ? <><strong>{formatAmount.format(amount)}</strong> บาท / เดือน</> : amount === null ? "ยังไม่ได้ระบุ" : "—"}</p>
      </div>
      {amount !== undefined && <div className="monthly-salary-actions">
        {typeof amount === "number" && !editing && <Link className="button-primary" href="/dashboard/transactions/new?from=salary">บันทึกเป็นรายรับ</Link>}
        <button ref={editButton} className="button-secondary" type="button" aria-expanded={editing} onClick={() => {
          if (editing) {
            closeEditor();
            return;
          }
          setInput(amount === null ? "" : String(amount));
          setEditing(true);
        }}>{editing ? "ปิด" : amount === null ? "ใส่เงินเดือน" : "แก้ไขเงินเดือน"}</button>
      </div>}
    </div>
    <p className="monthly-salary-note" id="monthly-salary-note">ยอดอ้างอิงสำหรับวางแผน แยกจากรายรับที่บันทึกแล้ว เก็บเฉพาะในเบราว์เซอร์นี้</p>
    {editing && <form className="monthly-salary-form" onSubmit={onSubmit}>
      <div className="form-field">
        <label htmlFor="overview-monthly-salary">ยอดสุทธิ (บาท / เดือน)</label>
        <input id="overview-monthly-salary" type="text" inputMode="decimal" value={input} placeholder="30,000.00"
          onChange={(event) => { setInput(event.target.value); setError(""); }}
          aria-describedby={error ? "monthly-salary-error" : "monthly-salary-note"}
          aria-invalid={error === monthlySalaryInputError} autoFocus />
      </div>
      <button className="button-primary" type="submit">บันทึก</button>
      {typeof amount === "number" && <button className="button-secondary" type="button" onClick={() => save(null)}>ลบยอดที่ตั้งไว้</button>}
    </form>}
    {error && <p className="field-error" id="monthly-salary-error" role="alert">{error}</p>}
  </section>;
}

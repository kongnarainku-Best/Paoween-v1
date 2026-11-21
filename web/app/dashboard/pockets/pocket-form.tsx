"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { createPocket } from "./actions";

export function PocketForm({ today }: { today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submissionId = useRef<string | null>(null);
  const [status, setStatus] = useState<{ message: string; error: boolean }>({ message: "", error: false });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    submissionId.current ??= crypto.randomUUID();
    const input = {
      id: submissionId.current,
      name: String(data.get("name") ?? ""),
      opening_balance_thb: String(data.get("opening_balance_thb") ?? ""),
      opening_date: String(data.get("opening_date") ?? ""),
    };
    setStatus({ message: "", error: false });
    startTransition(async () => {
      try {
        const result = await createPocket(input);
        if (!result.ok) {
          setStatus({ message: Object.values(result.fieldErrors)[0] ?? result.error, error: true });
          return;
        }
        form.reset();
        submissionId.current = null;
        setStatus({ message: "สร้างกระเป๋าแล้ว", error: false });
        router.refresh();
      } catch {
        setStatus({ message: "สร้างกระเป๋าไม่สำเร็จ กรุณาลองอีกครั้ง", error: true });
      }
    });
  }

  return <form className="form-card" onSubmit={submit}>
    <h2>เพิ่มกระเป๋า</h2>
    <p className="muted">ใส่ยอดเงิน ณ ต้นวันที่เริ่มติดตาม</p>
    <fieldset disabled={pending} className="form-grid pocket-inputs">
      <div className="form-field"><label htmlFor="pocket-name">ชื่อกระเป๋า</label>
        <input id="pocket-name" name="name" maxLength={80} placeholder="เช่น เงินสด หรือกสิกร" required />
      </div>
      <div className="form-field"><label htmlFor="pocket-opening-balance">ยอดตั้งต้น (บาท)</label>
        <input id="pocket-opening-balance" name="opening_balance_thb" type="number" step="0.01" inputMode="decimal" required />
      </div>
      <div className="form-field"><label htmlFor="pocket-opening-date">วันที่เริ่มติดตาม</label>
        <input id="pocket-opening-date" name="opening_date" type="date" max={today} defaultValue={today} required />
      </div>
    </fieldset>
    {status.message && <p className={status.error ? "notice notice-error" : "notice notice-success"} role={status.error ? "alert" : "status"}>{status.message}</p>}
    <div className="form-actions"><button className="button-primary" type="submit" disabled={pending}>{pending ? "กำลังสร้าง…" : "สร้างกระเป๋า"}</button></div>
  </form>;
}

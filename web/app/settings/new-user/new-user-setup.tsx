"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, CircleCheck, FileImage, ImagePlus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { completeOnboardingAction } from "@/app/settings/new-user/actions";
import { PaoweenStage } from "@/app/dashboard/paoween-stage";

type Step = 1 | 2 | 3;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxSlipBytes = 10 * 1024 * 1024;

export function NewUserSetup({ accountName }: { accountName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [salary, setSalary] = useState("");
  const [savedSalary, setSavedSalary] = useState<number | null>(null);
  const [slip, setSlip] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function chooseSlip(file?: File) {
    setError("");
    if (!file) return;
    if (!acceptedTypes.has(file.type)) {
      setError("รองรับเฉพาะภาพ JPG, PNG หรือ WebP");
      return;
    }
    if (file.size > maxSlipBytes) {
      setError("เลือกภาพที่มีขนาดไม่เกิน 10 MB");
      return;
    }
    setSlip(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function continueFromSalary(skip = false) {
    setError("");
    if (skip) {
      setSavedSalary(null);
      setStep(2);
      return;
    }
    const value = Number(salary.replaceAll(",", "").trim());
    if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) {
      setError("ใส่เงินเดือนสุทธิต่อเดือนให้มากกว่า 0 หรือเลือกข้ามไปก่อน");
      return;
    }
    setSavedSalary(value);
    setStep(2);
  }

  function finishSetup() {
    setSaveError(false);
    try {
      sessionStorage.setItem("paoween-onboarding-handoff", JSON.stringify({ salary: savedSalary, hasSlip: Boolean(slip) }));
    } catch {
      setSaveError(true);
      return;
    }
    startSaving(async () => {
      try {
        const result = await completeOnboardingAction();
        if (!result.ok) throw new Error("setup");
        router.replace("/dashboard");
        router.refresh();
      } catch {
        sessionStorage.removeItem("paoween-onboarding-handoff");
        setSaveError(true);
      }
    });
  }

  function removeSlip() {
    setSlip(null);
    setPreviewUrl("");
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return <main className="onboarding-page">
    <header className="onboarding-header">
      <a className="wordmark" href="/" aria-label="น้องเป๋าวีน">
        <Image src="/paoween/paoween.webp" alt="" width={38} height={38} unoptimized />
        <span>น้องเป๋าวีน</span>
      </a>
      <span className="onboarding-account"><ShieldCheck size={15} aria-hidden="true" /> {accountName}</span>
    </header>

    <div className="onboarding-progress" aria-label={`ขั้นตอนที่ ${step} จาก 3`}>
      {[1, 2, 3].map((index) => <span key={index} className={step >= index ? "is-complete" : ""} />)}
    </div>

    <div className="onboarding-shell">
      <section className="onboarding-main" aria-live="polite">
        {step === 1 && <>
          <p className="eyebrow">เริ่มต้นกับเป๋าวีน · 01 / 03</p>
          <h1>เริ่มจากเงินเข้า<br />ของคุณกันก่อน</h1>
          <p className="onboarding-lead">ตัวเลขนี้ช่วยให้เห็นภาพรายรับกับรายจ่ายชัดขึ้น ใส่ยอดสุทธิที่เข้าบัญชีจริงต่อเดือน หรือข้ามได้เลย</p>
          <label className="onboarding-field" htmlFor="monthly-salary">เงินเดือนสุทธิต่อเดือน</label>
          <div className="onboarding-money-input"><input id="monthly-salary" type="number" min="1" max="10000000" step="0.01" inputMode="decimal" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="เช่น 30,000" aria-describedby="salary-help" /><span>บาท / เดือน</span></div>
          <p className="onboarding-field-help" id="salary-help">ยอดหลังหักต่าง ๆ ที่ได้รับจริง · เก็บไว้ชั่วคราวในแท็บนี้เท่านั้น</p>
          {error && step === 1 && <p className="notice notice-error onboarding-error" role="alert">{error}</p>}
          <div className="onboarding-actions"><button className="button-primary" type="button" onClick={() => continueFromSalary()}>ไปต่อ <ArrowRight size={16} aria-hidden="true" /></button><button className="onboarding-skip" type="button" onClick={() => continueFromSalary(true)}>ยังไม่สะดวกบอก ข้ามไปก่อน</button></div>
        </>}

        {step === 2 && <>
          <p className="eyebrow">เริ่มบันทึกด้วยกัน · 02 / 03</p>
          <h1>มีสลิปรายจ่ายไหม?<br />เลือกภาพไว้ดูได้เลย</h1>
          <p className="onboarding-lead">เริ่มจากรายการที่อยากจดตั้งแต่วันนี้ ไม่ต้องย้อนหาให้ครบทุกใบ</p>
          <div className={`onboarding-dropzone${slip ? " has-slip" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseSlip(event.dataTransfer.files[0]); }}>
            <input ref={fileRef} className="sr-only" id="onboarding-slip" type="file" accept="image/jpeg,image/png,image/webp" aria-label="เลือกภาพสลิป" onChange={(event) => chooseSlip(event.target.files?.[0])} />
            {slip && previewUrl ? <div className="onboarding-slip-preview"><Image src={previewUrl} alt="ภาพสลิปที่เลือกสำหรับดูตัวอย่าง" width={220} height={156} unoptimized /><div><strong><FileImage size={15} aria-hidden="true" /> {slip.name}</strong><small>พร้อมดูตัวอย่างในหน้านี้</small></div><button type="button" className="icon-button" aria-label="นำภาพสลิปออก" onClick={removeSlip}><Trash2 size={16} aria-hidden="true" /></button></div> : <label htmlFor="onboarding-slip" className="onboarding-dropzone-prompt"><span className="onboarding-upload-icon"><ImagePlus size={21} aria-hidden="true" /></span><strong>เลือกภาพสลิป หรือลากมาวางที่นี่</strong><small>รองรับ JPG, PNG และ WebP · ไม่เกิน 10 MB</small><span className="button-secondary button-small">เลือกภาพสลิป <ArrowRight size={14} aria-hidden="true" /></span></label>}
          </div>
          <p className="onboarding-local-note"><ShieldCheck size={16} aria-hidden="true" /><span>รูปจะแสดงอยู่ในหน้านี้เท่านั้น ตอนนี้เว็บยังไม่อัปโหลดหรืออ่านสลิป และจะไม่บันทึกรายการให้เอง</span></p>
          {error && <p className="notice notice-error onboarding-error" role="alert">{error}</p>}
          <div className="onboarding-actions"><button className="button-primary" type="button" onClick={() => setStep(3)}>ไปดูสรุป <ArrowRight size={16} aria-hidden="true" /></button><button className="button-secondary" type="button" onClick={() => setStep(1)}><ArrowLeft size={15} aria-hidden="true" /> ย้อนกลับ</button><button className="onboarding-skip" type="button" onClick={() => { removeSlip(); setStep(3); }}>ยังไม่มีสลิป ข้ามไปก่อน</button></div>
        </>}

        {step === 3 && <>
          <p className="eyebrow">พร้อมแล้ว · 03 / 03</p>
          <h1>พื้นที่ของคุณ<br />พร้อมเริ่มต้นแล้ว</h1>
          <p className="onboarding-lead">ต่อจากนี้ค่อย ๆ เติมรายการจริงเมื่อพร้อม เป๋าวีนจะช่วยดูภาพรวมไปด้วยกัน</p>
          <div className="onboarding-review-summary">
            <div><span>เงินเดือนต่อเดือน</span><strong>{savedSalary === null ? "ยังไม่ได้ระบุ" : `${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(savedSalary)} บาท`}</strong></div>
            <div><span>สลิปที่เลือก</span><strong>{slip ? "เลือกไว้ดูตัวอย่าง" : "ยังไม่ได้เลือก"}</strong></div>
          </div>
          <p className="onboarding-local-note"><ShieldCheck size={16} aria-hidden="true" /><span>เงินเดือนจะใช้แสดงในหน้านี้ชั่วคราวเท่านั้น สลิปยังไม่ได้อัปโหลดหรือบันทึก ไม่มีการสร้างรายการการเงินจากขั้นตอนนี้</span></p>
          {saveError && <p className="notice notice-error onboarding-error" role="alert">บันทึกสถานะเริ่มต้นไม่สำเร็จ ลองกดอีกครั้งนะ</p>}
          <div className="onboarding-actions"><button className="button-primary" type="button" disabled={saving} onClick={finishSetup}>{saving ? "กำลังเตรียมพื้นที่…" : "ไปดูภาพรวม"} {!saving && <ArrowRight size={16} aria-hidden="true" />}</button><button className="button-secondary" type="button" disabled={saving} onClick={() => setStep(2)}><ArrowLeft size={15} aria-hidden="true" /> ย้อนกลับ</button></div>
        </>}
      </section>

      <aside className="onboarding-companion" aria-label="เป๋าวีน เพื่อนคู่คิดเรื่องเงิน">
        <div className="onboarding-companion-stage"><span className="onboarding-stage-badge"><CircleCheck size={13} aria-hidden="true" /> {step === 3 ? "พร้อมเริ่มต้น" : "YOUR MONEY BUDDY"}</span><PaoweenStage mood={step === 3 ? "done" : step === 2 ? "listening" : "idle"} /></div>
        <div><span className="onboarding-companion-name">เป๋าวีนเอง!</span><h2>{step === 1 ? "ยินดีที่ได้รู้จักนะ" : step === 2 ? "เริ่มจากสลิปใบแรก" : "ไปด้วยกันนะ"}</h2><p>เรื่องเงินค่อย ๆ ชัดขึ้นได้ ทีละก้าว</p></div>
        <div className="onboarding-privacy"><ShieldCheck size={16} aria-hidden="true" /><span>นี่คือพื้นที่ส่วนตัวของ {accountName}</span></div>
      </aside>
    </div>
    <footer className="onboarding-footer"><span>ค่อย ๆ ไปด้วยกันนะ</span><span>ข้อมูลจากเครื่องของคุณไม่ได้ถูกนำเข้ามา</span></footer>
  </main>;
}

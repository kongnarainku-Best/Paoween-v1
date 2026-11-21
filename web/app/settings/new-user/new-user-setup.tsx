"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, CircleCheck, FileImage, FileText, ImagePlus, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";

import { completeOnboardingAction } from "@/app/settings/new-user/actions";
import { useOnboardingHandoff } from "@/app/settings/new-user/onboarding-handoff";
import { PaoweenStage } from "@/app/dashboard/paoween-stage";
import { monthlySalaryInputError, monthlySalaryStorageError, parseMonthlySalary, setMonthlySalary } from "@/lib/finance/monthly-salary";

type Step = 1 | 2 | 3;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxSlipBytes = 10 * 1024 * 1024;
type SlipKind = "image" | "pdf";

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function NewUserSetup({ userId, accountName, scope, today }: { userId: string; accountName: string; scope: string; today: string }) {
  const handoff = useOnboardingHandoff();
  const [step, setStep] = useState<Step>(1);
  const [salary, setSalary] = useState("");
  const [savedSalary, setSavedSalary] = useState<number | null>(null);
  const [slip, setSlip] = useState<File | null>(null);
  const [slipKind, setSlipKind] = useState<SlipKind | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [checkingFile, setCheckingFile] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pocketErrors, setPocketErrors] = useState<Record<string, string>>({});
  const [createFirstPocket, setCreateFirstPocket] = useState(false);
  const [pocketName, setPocketName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDate, setOpeningDate] = useState(today);
  const [saving, startSaving] = useTransition();
  const submitting = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileSelection = useRef(0);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function chooseSlip(file?: File) {
    if (!file) return;
    const selection = ++fileSelection.current;
    setCheckingFile(false);
    setError("");
    const isPdf = file.type === "application/pdf" || (file.type === "" && file.name.toLowerCase().endsWith(".pdf"));
    if (!isPdf && !acceptedImageTypes.has(file.type)) {
      setError("รองรับเฉพาะภาพ JPG, PNG, WebP หรือไฟล์ PDF");
      return;
    }
    if (file.size === 0) {
      setError("ไฟล์นี้ว่างเปล่า กรุณาเลือกไฟล์ใหม่");
      return;
    }
    if (file.size > maxSlipBytes) {
      setError("เลือกไฟล์ที่มีขนาดไม่เกิน 10 MB");
      return;
    }
    if (isPdf) {
      setCheckingFile(true);
      let header: string;
      try {
        header = await file.slice(0, 5).text();
      } catch {
        if (selection !== fileSelection.current) return;
        setCheckingFile(false);
        setError("ตรวจไฟล์ PDF ไม่สำเร็จ ลองเลือกไฟล์อีกครั้ง");
        return;
      }
      if (selection !== fileSelection.current) return;
      setCheckingFile(false);
      if (header !== "%PDF-") {
        setError("ไฟล์นี้ไม่มีหัวไฟล์ PDF ลองเลือกไฟล์ statement อีกครั้ง");
        return;
      }
    }
    setSlip(file);
    setSlipKind(isPdf ? "pdf" : "image");
    setPreviewUrl(isPdf ? "" : URL.createObjectURL(file));
  }

  function continueFromSalary(skip = false) {
    setError("");
    if (skip) {
      setSavedSalary(null);
      setStep(2);
      return;
    }
    const value = parseMonthlySalary(salary);
    if (value === null) {
      setError(monthlySalaryInputError);
      return;
    }
    setSavedSalary(value);
    setStep(2);
  }

  function finishSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setSaveError("");
    setPocketErrors({});
    if (savedSalary !== null) {
      try {
        setMonthlySalary(userId, savedSalary);
      } catch {
        setSaveError(monthlySalaryStorageError);
        return;
      }
    }
    submitting.current = true;
    const image = slipKind === "image" ? slip : null;
    handoff.offer(scope, image ? { kind: "slip", file: image } : { kind: "summary", fileKind: slipKind });
    startSaving(async () => {
      try {
        const result = await completeOnboardingAction({
          scope,
          reviewSlip: Boolean(image),
          ...(createFirstPocket ? { pocket: { name: pocketName, opening_balance_thb: openingBalance, opening_date: openingDate } } : {}),
        });
        handoff.discard(scope);
        setSaveError(result.error);
        setPocketErrors(result.fieldErrors ?? {});
      } catch (error) {
        unstable_rethrow(error);
        handoff.discard(scope);
        setSaveError("บันทึกสถานะเริ่มต้นไม่สำเร็จ ลองอีกครั้งนะ");
      } finally {
        submitting.current = false;
      }
    });
  }

  function cancelFileCheck() {
    fileSelection.current += 1;
    setCheckingFile(false);
  }

  function removeSlip() {
    cancelFileCheck();
    setSlip(null);
    setSlipKind(null);
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
          <p className="onboarding-lead">ใส่ยอดเงินเดือนสุทธิเพื่อใช้เป็นยอดอ้างอิงในหน้าภาพรวม หรือข้ามได้เลย</p>
          <label className="onboarding-field" htmlFor="monthly-salary">เงินเดือนสุทธิต่อเดือน</label>
          <div className="onboarding-money-input"><input id="monthly-salary" type="text" inputMode="decimal" value={salary} onChange={(event) => { setSalary(event.target.value); setError(""); }} placeholder="เช่น 30,000" aria-invalid={Boolean(error)} aria-describedby={error ? "salary-help salary-error" : "salary-help"} /><span>บาท / เดือน</span></div>
          <p className="onboarding-field-help" id="salary-help">ยอดหลังหักต่าง ๆ ที่ได้รับจริง เก็บไว้ในเบราว์เซอร์นี้</p>
          {error && <p className="notice notice-error onboarding-error" id="salary-error" role="alert">{error}</p>}
          <div className="onboarding-actions"><button className="button-primary" type="button" onClick={() => continueFromSalary()}>ไปต่อ <ArrowRight size={16} aria-hidden="true" /></button><button className="onboarding-skip" type="button" onClick={() => continueFromSalary(true)}>ยังไม่สะดวกบอก ข้ามไปก่อน</button></div>
        </>}

        {step === 2 && <>
          <p className="eyebrow">เริ่มบันทึกด้วยกัน · 02 / 03</p>
          <h1>มีสลิปหรือ statement ไหม?<br />เลือกไฟล์ไว้ดูได้เลย</h1>
          <p className="onboarding-lead">เลือกสลิปเพื่อเตรียมแนบในแชต หรือเลือก statement PDF เพื่อดูชื่อไฟล์และขนาด</p>
          <div className={`onboarding-dropzone${slip ? " has-slip" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseSlip(event.dataTransfer.files[0]); }}>
            <input ref={fileRef} className="sr-only" id="onboarding-slip" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" aria-label="เลือกภาพสลิปหรือไฟล์ statement PDF" onChange={(event) => void chooseSlip(event.target.files?.[0])} />
            {slip && slipKind === "image" && previewUrl ? <div className="onboarding-slip-preview"><Image src={previewUrl} alt="ภาพสลิปที่เลือกสำหรับดูตัวอย่าง" width={220} height={156} unoptimized /><div><strong><FileImage size={15} aria-hidden="true" /> {slip.name}</strong><small>พร้อมดูตัวอย่างในหน้านี้</small></div><button type="button" className="icon-button" aria-label="นำภาพสลิปออก" onClick={removeSlip}><Trash2 size={16} aria-hidden="true" /></button></div> : slip && slipKind === "pdf" ? <div className="onboarding-slip-preview onboarding-pdf-preview"><span className="onboarding-pdf-icon" aria-hidden="true"><FileText size={34} /><b>PDF</b></span><div><strong><FileText size={15} aria-hidden="true" /> {slip.name}</strong><small>statement PDF · {formatFileSize(slip.size)} · ยังไม่ได้เปิดอ่านเนื้อหา</small></div><button type="button" className="icon-button" aria-label="นำไฟล์ statement ออก" onClick={removeSlip}><Trash2 size={16} aria-hidden="true" /></button></div> : <label htmlFor="onboarding-slip" className="onboarding-dropzone-prompt"><span className="onboarding-upload-icon"><ImagePlus size={21} aria-hidden="true" /></span><strong>เลือกสลิปหรือ statement PDF หรือลากมาวางที่นี่</strong><small>รองรับ JPG, PNG, WebP และ PDF · ไม่เกิน 10 MB</small><span className="button-secondary button-small">เลือกไฟล์ <ArrowRight size={14} aria-hidden="true" /></span></label>}
          </div>
          <p className="onboarding-local-note"><ShieldCheck size={16} aria-hidden="true" /><span>สลิปจะส่งให้เป๋าวีนอ่านเมื่อคุณกดส่งในแชต ส่วน PDF แสดงชื่อและขนาดไฟล์ในขั้นตอนนี้</span></p>
          {checkingFile && <p role="status">กำลังตรวจไฟล์ PDF…</p>}
          {error && <p className="notice notice-error onboarding-error" role="alert">{error}</p>}
          <div className="onboarding-actions"><button className="button-primary" type="button" disabled={checkingFile} onClick={() => setStep(3)}>ไปดูสรุป <ArrowRight size={16} aria-hidden="true" /></button><button className="button-secondary" type="button" onClick={() => { cancelFileCheck(); setStep(1); }}><ArrowLeft size={15} aria-hidden="true" /> ย้อนกลับ</button><button className="onboarding-skip" type="button" onClick={() => { removeSlip(); setStep(3); }}>ยังไม่มีไฟล์ ข้ามไปก่อน</button></div>
        </>}

        {step === 3 && <>
          <p className="eyebrow">พร้อมแล้ว · 03 / 03</p>
          <h1>พื้นที่ของคุณ<br />พร้อมเริ่มต้นแล้ว</h1>
          <p className="onboarding-lead">ตั้งกระเป๋าใบแรกไว้ติดตามเงิน หรือเริ่มบันทึกรายการได้เลย</p>
          <div className="onboarding-review-summary">
            <div><span>เงินเดือนต่อเดือน</span><strong>{savedSalary === null ? "ยังไม่ได้ระบุ" : `${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(savedSalary)} บาท`}</strong></div>
            <div><span>ไฟล์ที่เลือก</span><strong>{slip ? (slipKind === "pdf" ? "statement PDF เลือกไว้ดูชื่อไฟล์" : "สลิปพร้อมแนบในแชต") : "ยังไม่ได้เลือก"}</strong></div>
          </div>
          <form onSubmit={finishSetup}>
            <section className="onboarding-pocket" aria-labelledby="onboarding-pocket-title">
              <div>
                <h2 id="onboarding-pocket-title"><Wallet size={18} aria-hidden="true" /> กระเป๋าใบแรก</h2>
                <p>ใช้แทนที่เก็บเงินจริง เช่น เงินสด หรือบัญชีธนาคาร เพิ่มกระเป๋าได้ภายหลัง</p>
              </div>
              <button className="button-secondary" type="button" disabled={saving} aria-expanded={createFirstPocket} aria-controls="onboarding-pocket-fields" onClick={() => { setCreateFirstPocket(!createFirstPocket); setSaveError(""); setPocketErrors({}); }}>
                {createFirstPocket ? "ตั้งค่าภายหลัง" : "ตั้งค่ากระเป๋าใบแรก"}
              </button>
              <fieldset className="form-grid" id="onboarding-pocket-fields" disabled={saving || !createFirstPocket} hidden={!createFirstPocket}>
                <div className="form-field onboarding-pocket-name">
                  <label htmlFor="onboarding-pocket-name">ชื่อกระเป๋า</label>
                  <input id="onboarding-pocket-name" value={pocketName} onChange={(event) => setPocketName(event.target.value)} maxLength={80} placeholder="เช่น เงินสด" required={createFirstPocket} aria-invalid={!!pocketErrors.name} aria-describedby={pocketErrors.name ? "onboarding-pocket-name-error" : undefined} />
                  {pocketErrors.name && <span className="field-error" id="onboarding-pocket-name-error">{pocketErrors.name}</span>}
                </div>
                <div className="form-field">
                  <label htmlFor="onboarding-opening-balance">ยอดตั้งต้น ณ ต้นวัน (บาท)</label>
                  <input id="onboarding-opening-balance" type="number" step="0.01" inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="เช่น 500.00" required={createFirstPocket} aria-invalid={!!pocketErrors.opening_balance_thb} aria-describedby={pocketErrors.opening_balance_thb ? "onboarding-opening-balance-error" : undefined} />
                  {pocketErrors.opening_balance_thb && <span className="field-error" id="onboarding-opening-balance-error">{pocketErrors.opening_balance_thb}</span>}
                </div>
                <div className="form-field">
                  <label htmlFor="onboarding-opening-date">วันที่เริ่มติดตาม</label>
                  <input id="onboarding-opening-date" type="date" value={openingDate} max={today} onChange={(event) => setOpeningDate(event.target.value)} required={createFirstPocket} aria-invalid={!!pocketErrors.opening_date} aria-describedby={pocketErrors.opening_date ? "onboarding-opening-date-error" : undefined} />
                  {pocketErrors.opening_date && <span className="field-error" id="onboarding-opening-date-error">{pocketErrors.opening_date}</span>}
                </div>
              </fieldset>
            </section>
            {saveError && <p className="notice notice-error onboarding-error" role="alert">{saveError}</p>}
            <div className="onboarding-actions"><button className="button-primary" type="submit" disabled={saving}>{saving ? "กำลังเตรียมพื้นที่…" : slipKind === "image" ? "ตรวจและบันทึกรายการแรก" : "ไปดูภาพรวม"} {!saving && <ArrowRight size={16} aria-hidden="true" />}</button><button className="button-secondary" type="button" disabled={saving} onClick={() => setStep(2)}><ArrowLeft size={15} aria-hidden="true" /> ย้อนกลับ</button></div>
          </form>
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

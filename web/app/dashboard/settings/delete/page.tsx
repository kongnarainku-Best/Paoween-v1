import Link from "next/link";
import { ShieldAlert, Trash2 } from "lucide-react";

import { deleteAccountAction, startDeleteAccountReauthAction } from "@/app/dashboard/actions";
import { hasRecentGoogleAuthentication, getSignedInUser } from "@/lib/finance/server";

type Search = Promise<{ error?: string; reauthenticated?: string }>;

const errorText: Record<string, string> = {
  setup: "ระบบล็อกอินยังตั้งค่าไม่ครบ",
  reauth: "เริ่มยืนยันตัวตนไม่สำเร็จ กรุณาลองอีกครั้ง",
  "reauth-required": "กรุณายืนยันตัวตนกับ Google อีกครั้งก่อนลบบัญชี",
  confirmation: "อีเมลหรือช่องยืนยันยังไม่ถูกต้อง",
  "service-key": "ระบบลบบัญชียังรอตั้งค่า secret key ใน Vercel Preview",
  signout: "ออกจากระบบของอุปกรณ์นี้ไม่สำเร็จ จึงยังไม่ได้ลบบัญชี",
  delete: "ลบบัญชีไม่สำเร็จ ข้อมูลยังอยู่ครบ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ",
};

export default async function DeleteAccountPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const { claims } = await getSignedInUser();
  const email = typeof claims.email === "string" ? claims.email : "";
  const recentlyAuthenticated = hasRecentGoogleAuthentication(claims as Record<string, unknown>);
  const readyToDelete = params.reauthenticated === "1" && recentlyAuthenticated;
  const serviceKeyReady = Boolean(process.env.SUPABASE_SECRET_KEY);

  return <div className="workspace-content narrow-content">
    <div className="breadcrumbs"><Link href="/dashboard/settings">ตั้งค่าบัญชี</Link><span>/</span><span>ลบบัญชี</span></div>
    <div className="dashboard-heading compact-heading"><div><p className="eyebrow">DELETE ACCOUNT</p><h1>ลบบัญชี<span className="period">.</span></h1><p className="muted">ข้อมูลทั้งหมดในบัญชีจะถูกลบอย่างถาวร</p></div></div>
    {params.error && errorText[params.error] && <p className="notice notice-error" role="alert">{errorText[params.error]}</p>}
    <section className="delete-account-panel">
      <div className="danger-heading"><span><ShieldAlert size={21} aria-hidden="true" /></span><div><strong>การลบนี้ย้อนกลับไม่ได้</strong><p>รายการรายรับรายจ่าย รายการภาษี และโปรไฟล์ของ {email} จะถูกลบ</p></div></div>
      {!serviceKeyReady && <p className="notice notice-warning">การลบบัญชียังไม่เปิดใช้งาน ผู้ดูแลต้องเพิ่ม <code>SUPABASE_SECRET_KEY</code> ใน Vercel Environment Variables ขอบเขต Preview แล้ว redeploy ก่อน</p>}
      {!readyToDelete ? <form action={startDeleteAccountReauthAction} className="reauth-form">
        <p>ยืนยันบัญชี Google อีกครั้งก่อนดำเนินการ เพื่อป้องกันการลบจากเซสชันเก่าที่เปิดค้างไว้</p>
        <button className="button-secondary" type="submit" disabled={!serviceKeyReady}>ยืนยันตัวตนด้วย Google</button>
      </form> : <form action={deleteAccountAction} className="delete-account-form">
        <p className="notice notice-success" role="status">ยืนยันตัวตนล่าสุดแล้ว กรอกอีเมลบัญชีเพื่อยืนยันการลบ</p>
        <div className="form-field"><label htmlFor="confirm_email">พิมพ์อีเมลบัญชี: <strong>{email}</strong></label><input id="confirm_email" name="confirm_email" type="email" autoComplete="email" required /></div>
        <label className="check-row"><input type="checkbox" name="confirm_delete" value="yes" required /> ฉันเข้าใจว่าข้อมูลจะถูกลบถาวรและไม่สามารถกู้คืนได้</label>
        <div className="form-actions"><Link className="button-secondary" href="/dashboard/settings">ยกเลิก</Link><button className="button-danger" type="submit" disabled={!serviceKeyReady}><Trash2 size={16} aria-hidden="true" /> ลบบัญชีถาวร</button></div>
      </form>}
    </section>
  </div>;
}

import { ShieldAlert } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { deleteAccountAction, startDeleteAccountReauthAction } from "@/app/dashboard/actions";
import { DeleteSubmitButton } from "@/app/dashboard/settings/delete/delete-submit-button";
import { deletionGrantCookie, hasDeletionGrant } from "@/lib/finance/account-deletion";
import { getSignedInUser } from "@/lib/finance/server";

type Search = Promise<{ error?: string }>;

const errorText: Record<string, string> = {
  setup: "ระบบล็อกอินยังตั้งค่าไม่ครบ",
  reauth: "ยืนยันตัวตนไม่สำเร็จ กรุณาลองอีกครั้ง",
  "reauth-required": "กรุณายืนยันตัวตนกับ Google อีกครั้งก่อนลบบัญชี",
  "account-mismatch": "บัญชีที่เลือกต่างจากบัญชีที่เริ่มขอลบ กรุณากลับไปเข้าสู่บัญชีที่ต้องการจัดการ",
  confirmation: "อีเมลหรือช่องยืนยันยังไม่ถูกต้อง",
  "service-key": "ฟีเจอร์ลบบัญชียังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล",
  delete: "ยืนยันผลการลบไม่ได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแล",
};

export default async function DeleteAccountPage({ searchParams }: { searchParams: Search }) {
  const [params, { claims }, cookieStore] = await Promise.all([searchParams, getSignedInUser(), cookies()]);
  const email = typeof claims.email === "string" ? claims.email : "";
  const serviceKeyReady = Boolean(process.env.SUPABASE_SECRET_KEY);
  const readyToDelete = serviceKeyReady && email && hasDeletionGrant(cookieStore.get(deletionGrantCookie)?.value, claims);

  return <div className="workspace-content narrow-content">
    <div className="breadcrumbs"><Link href="/dashboard/settings">ตั้งค่าบัญชี</Link><span>/</span><span>ลบบัญชีและข้อมูล</span></div>
    <div className="dashboard-heading compact-heading"><div><h1>ลบบัญชีและข้อมูล</h1></div></div>
    {params.error && errorText[params.error] && <p className="notice notice-error" role="alert">{errorText[params.error]}</p>}
    <section className="delete-account-panel">
      <div className="danger-heading">
        <span><ShieldAlert size={21} aria-hidden="true" /></span>
        <div>
          <strong>การลบนี้ย้อนกลับไม่ได้</strong>
          <p>บัญชี Paoween {email} รวมถึงโปรไฟล์ ธุรกรรม รายการภาษี และประวัติการใช้ AI ใน Paoween จะถูกลบถาวร</p>
          {params.error !== "account-mismatch" && <p>หากต้องการเก็บสำเนาธุรกรรมและรายการภาษี <a className="text-link" href="/api/export">ดาวน์โหลดข้อมูลก่อนลบ</a></p>}
        </div>
      </div>
      {!serviceKeyReady && <p className="notice notice-warning">{errorText["service-key"]}</p>}
      {!readyToDelete ? <form action={startDeleteAccountReauthAction} className="reauth-form">
        {serviceKeyReady && <p>เลือกบัญชี Google เดิมเพื่อยืนยันตัวตน ขั้นตอนนี้ยังไม่ลบข้อมูล</p>}
        <div className="form-actions">
          <Link className="button-secondary" href="/dashboard/settings">กลับไปหน้าตั้งค่า</Link>
          <button className="button-primary" type="submit" disabled={!serviceKeyReady || params.error === "account-mismatch"}>ยืนยันตัวตนด้วย Google</button>
        </div>
      </form> : <form action={deleteAccountAction} className="delete-account-form">
        <p className="notice notice-success" role="status">ยืนยันตัวตนแล้ว คุณมีเวลา 5 นาทีในการยืนยันการลบ</p>
        <div className="form-field">
          <label htmlFor="confirm_email">พิมพ์อีเมลบัญชี <strong>{email}</strong></label>
          <input id="confirm_email" name="confirm_email" type="email" autoComplete="off" required />
        </div>
        <label className="check-row"><input type="checkbox" name="confirm_delete" value="yes" required /> ฉันยืนยันให้ลบบัญชี Paoween และข้อมูลของบัญชีนี้อย่างถาวร</label>
        <div className="form-actions"><Link className="button-secondary" href="/dashboard/settings">ยกเลิก</Link><DeleteSubmitButton /></div>
      </form>}
    </section>
  </div>;
}

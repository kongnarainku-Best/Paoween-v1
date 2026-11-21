import { ArrowUpRight, LockKeyhole, ShieldCheck } from "lucide-react";
import Image from "next/image";

import { signInWithGoogle } from "@/app/actions";
import { hasSupabaseEnv } from "@/lib/supabase/env";

type SearchParams = Promise<{ error?: string; account?: string }>;

const authErrors: Record<string, string> = {
  setup: "ระบบล็อกอินยังตั้งค่าไม่ครบ ผู้ดูแลต้องเพิ่มค่าของ Supabase ก่อน",
  oauth: "ล็อกอินไม่สำเร็จ ลองอีกครั้ง หรือติดต่อผู้ดูแลระบบ",
  delete: "ลบบัญชีไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบก่อนลองอีกครั้ง",
};

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { error, account } = await searchParams;
  const configured = hasSupabaseEnv();

  return (
    <main className="landing">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="เป๋าวีน หน้าหลัก">
          <Image className="brand-mascot" src="/paoween/paoween.webp" alt="" width={38} height={38} priority unoptimized />
          <span>น้องเป๋าวีน</span>
        </a>
        <span className="private-label"><LockKeyhole size={15} aria-hidden="true" /> พื้นที่ส่วนตัว</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">A LITTLE CLARITY, EVERY DAY</p>
          <h1 id="hero-title">เรื่องเงิน<br />ค่อย ๆ คิดไปด้วยกัน<span className="period">.</span></h1>
          <p className="hero-intro">
            เป๋าวีนช่วยให้คุณมองเห็นภาพการเงินของตัวเองชัดขึ้น
            เริ่มจากพื้นที่ว่างส่วนตัวของคุณ แล้วค่อย ๆ เติมข้อมูลเมื่อพร้อม
          </p>

          {error && authErrors[error] ? (
            <p className="notice notice-error" role="alert">{authErrors[error]}</p>
          ) : null}

          {account === "deleted" && !error && <p className="notice notice-success" role="status">ลบบัญชี Paoween และข้อมูลของบัญชีเรียบร้อยแล้ว</p>}

          <form action={signInWithGoogle}>
            <button className="google-button" type="submit" disabled={!configured}>
              <GoogleMark />
              <span>เข้าสู่ระบบด้วย Google</span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          </form>
          {!configured ? (
            <p className="setup-note" role="status">ระบบล็อกอินจะพร้อมเมื่อเชื่อมต่อ Supabase</p>
          ) : null}

          <div className="trust-row">
            <div className="trust-icon"><ShieldCheck size={17} aria-hidden="true" /></div>
            <p><strong>เริ่มต้นแบบว่างเปล่า</strong><br />ข้อมูลจากไฟล์ในเครื่องของคุณจะไม่ถูกนำเข้ามาเอง</p>
          </div>
        </div>

        <aside className="preview-card" aria-label="ภาพตัวอย่างพื้นที่ส่วนตัว">
          <div className="card-topline"><span>MY MONEY SPACE</span><span className="live-dot" /></div>
          <div className="wallet-art" aria-hidden="true">
            <Image src="/paoween/paoween.webp" alt="" width={250} height={250} priority unoptimized sizes="(max-width: 700px) 210px, 250px" />
          </div>
          <div className="empty-state">
            <span className="empty-line short" /><span className="empty-line" />
            <div><span className="empty-tile" /><span className="empty-tile" /><span className="empty-tile" /></div>
          </div>
          <p className="card-caption">พื้นที่ใหม่ของคุณ<br /><strong>พร้อมเริ่มเมื่อคุณพร้อม</strong></p>
        </aside>
      </section>

      <footer className="site-footer">
        <span>ข้อมูลของคุณเป็นของคุณ</span>
        <span>เริ่มต้นด้วยบัญชีใหม่ที่ยังไม่มีข้อมูล</span>
      </footer>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.5v-5.3H5.8a20 20 0 0 0 0 18.1l6.8-5.3Z" />
      <path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3.1l5.9-5.9A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.8 14.9l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z" />
    </svg>
  );
}

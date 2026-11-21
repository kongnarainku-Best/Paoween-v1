import { MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";

import { AssistantOpenButton } from "@/app/dashboard/assistant/assistant-dock";

export default function AssistantPage() {
  return <div className="workspace-content assistant-page">
    <section className="assistant-page-hero">
      <div className="assistant-page-copy">
        <p className="eyebrow">YOUR MONEY COMPANION</p>
        <h1>คุยกับเป๋าวีน<span className="period">.</span></h1>
        <p>ผู้ช่วยเรื่องเงินที่เปิดคุยได้จากทุกหน้า ถามเป็นภาษาไทย แนบภาพบิลให้ช่วยอ่านได้ และเลือกเองว่าจะให้ใช้ข้อมูลรายการในเว็บประกอบคำตอบหรือไม่</p>
        <AssistantOpenButton />
        <div className="assistant-page-privacy"><ShieldCheck size={16} aria-hidden="true" /><span>ข้อความและภาพจะส่งไป OpenAI API เมื่อกดส่งเท่านั้น · รายการเงินจะถูกแนบเมื่อคุณเลือกเปิดการตั้งค่านี้</span></div>
      </div>
      <div className="assistant-page-mascot" aria-label="เป๋าวีนกำลังรอช่วยคิด">
        <span><Sparkles size={14} aria-hidden="true" /> YOUR MONEY BUDDY</span>
        <Image src="/paoween/paoween.webp" alt="น้องเป๋าวีน" width={215} height={215} unoptimized priority />
      </div>
    </section>
    <section className="assistant-page-hint panel">
      <span className="assistant-page-hint-icon"><MessageCircle size={19} aria-hidden="true" /></span>
      <div><h2>เริ่มจากเรื่องที่อยากรู้</h2><p>เช่น “ช่วยสรุปรายจ่ายเดือนนี้” หรือ “มีอะไรที่ควรเตรียมก่อนยื่นภาษี” · เป๋าวีนจะร่างคำตอบให้ และรายการใหม่จะบันทึกก็ต่อเมื่อคุณตรวจและยืนยัน</p></div>
    </section>
    <footer className="workspace-footer">ใช้แชตมุมขวาล่างได้จากทุกหน้า · การตั้งค่า AI อยู่ในเมนูตั้งค่า</footer>
  </div>;
}

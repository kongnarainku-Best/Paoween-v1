import { CalendarDays, FileSpreadsheet, ImagePlus, LaptopMinimal, Search, Sparkles } from "lucide-react";

const localFeatures = [
  { id: "codex", icon: Sparkles, title: "คุยกับเป๋าวีนผ่าน Codex ในเครื่อง", description: "ใช้บัญชีและการใช้งาน Codex ที่ลงชื่อเข้าไว้ในเครื่อง พร้อมร่างรายการให้คุณตรวจและยืนยันก่อนบันทึก" },
  { id: "receipts", icon: ImagePlus, title: "แนบสลิปและอ่านใบเสร็จ", description: "ใช้ภาพใบเสร็จกับขั้นตอน OCR ที่รันจากเครื่อง และตรวจรายการก่อนเพิ่มลงบัญชี local" },
  { id: "calendar", icon: CalendarDays, title: "ปฏิทินบิลและกำหนดจ่าย", description: "ตารางและการเชื่อมบิลกับรายการจ่ายยังเก็บในเครื่อง ไม่ส่งกำหนดการหรือข้อมูลบิลขึ้นเว็บ" },
  { id: "shopping", icon: Search, title: "ตัวช่วยเลือกซื้อ", description: "การค้นหาราคาและการตัดสินใจซื้อที่ใช้ข้อมูลสดหรือบริบทการเงินส่วนตัวคงอยู่ในแอป local" },
  { id: "csv", icon: FileSpreadsheet, title: "ไฟล์ CSV และข้อมูลอ้างอิงเดิม", description: "การเปิด database.csv, tax_preparation.csv, แหล่งที่มาจาก worksheet และการทำงานกับไฟล์ในเครื่อง" },
];

export default function LocalToolsPage() {
  return <div className="workspace-content">
    <div className="dashboard-heading"><div><p className="eyebrow">LOCAL COMPANION</p><h1>ฟีเจอร์ที่อยู่ในเครื่อง<span className="period">.</span></h1><p className="muted">ยังใช้ต่อได้จาก dashboard local โดยไม่ส่งข้อมูลเหล่านี้ขึ้นเว็บ</p></div><LaptopMinimal size={26} aria-hidden="true" /></div>
    <div className="notice notice-warning local-boundary"><strong>บัญชี local กับบัญชีเว็บแยกจากกัน</strong><p>เว็บเริ่มต้นด้วยพื้นที่ว่างของผู้ใช้แต่ละคน ข้อมูลในเครื่องจะไม่ถูกย้ายหรือซิงก์เข้าบัญชีเว็บโดยอัตโนมัติ</p></div>
    <div className="local-feature-grid">{localFeatures.map(({ id, icon: Icon, title, description }) => <article className="local-feature-card" id={id} key={id}><span><Icon size={19} aria-hidden="true" /></span><div><h2>{title}</h2><p>{description}</p></div><span className="local-badge">เฉพาะในเครื่อง</span></article>)}</div>
    <section className="panel local-note"><p className="eyebrow">OPEN THE LOCAL APP</p><h2>เปิด dashboard ในเครื่อง</h2><p>กลับไปยังโฟลเดอร์โปรเจกต์ Personal_money แล้วเปิด <code>open-dashboard.command</code> จากนั้นใช้งาน dashboard ที่รันบนเครื่องนี้</p><p className="small-note">แอปบนเว็บเหมาะกับข้อมูลที่คุณเลือกบันทึกใหม่ในบัญชีเว็บ ส่วนไฟล์และความสามารถที่พึ่งพาเครื่องนี้ยังอยู่ใน local</p></section>
  </div>;
}

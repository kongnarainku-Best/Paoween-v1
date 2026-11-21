import Link from "next/link";
import { ArrowUpRight, Check, Download, KeyRound, Trash2, X } from "lucide-react";

import { getSignedInUser } from "@/lib/finance/server";
import { getAiReadiness } from "@/lib/finance/ai-readiness";

const vercelEnvironmentUrl = "https://vercel.com/docs/environment-variables";
const supabaseSqlUrl = "https://supabase.com/dashboard";
const migrationUrl = "https://github.com/kongnarainku-Best/Paoween-v1/blob/main/web/supabase/migrations/20261121000100_enable_openai_gpt6_luna.sql";

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li><span className={ok ? "ai-check ok" : "ai-check pending"}>{ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}</span><span>{children}</span><strong>{ok ? "พร้อม" : "ยังไม่ตั้งค่า"}</strong></li>;
}

export default async function SettingsPage() {
  const [{ claims, supabase, userId }, ai] = await Promise.all([getSignedInUser(), getAiReadiness()]);
  const email = typeof claims.email === "string" ? claims.email : "บัญชี Google ของคุณ";
  const budgetReady = ai.policyConfigured && ai.policyEnabled && ai.modelRateConfigured;
  const dayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const today = `${dayParts.find((part) => part.type === "year")?.value}-${dayParts.find((part) => part.type === "month")?.value}-${dayParts.find((part) => part.type === "day")?.value}`;
  const { data: usageRows } = await supabase.from("ai_usage_events")
    .select("status,input_tokens,output_tokens,estimated_cost_usd,reserved_cost_usd")
    .eq("user_id", userId).gte("created_at", `${today}T00:00:00+07:00`)
    .in("status", ["reserved", "completed"]).limit(100);
  const usage = (usageRows ?? []).reduce((summary, row) => ({
    requests: summary.requests + 1,
    inputTokens: summary.inputTokens + row.input_tokens,
    outputTokens: summary.outputTokens + row.output_tokens,
    estimatedCost: summary.estimatedCost + Number(row.estimated_cost_usd),
    reservedCost: summary.reservedCost + (row.status === "reserved" ? Number(row.reserved_cost_usd) : 0),
  }), { requests: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0, reservedCost: 0 });

  return <div className="workspace-content narrow-content">
    <div className="dashboard-heading"><div><p className="eyebrow">ACCOUNT SETTINGS</p><h1>ตั้งค่าบัญชี<span className="period">.</span></h1><p className="muted">ข้อมูลและการควบคุมบัญชีของคุณ</p></div></div>

    <section className="ai-settings-card">
      <div className="ai-settings-heading"><span className="ai-settings-icon"><KeyRound size={20} aria-hidden="true" /></span><div><p className="eyebrow">OPENAI API</p><h2>ตั้งค่าผู้ช่วย AI</h2><p>ใช้ GPT-6 Luna ผ่าน API ฝั่งเซิร์ฟเวอร์ โดยไม่ส่ง API key ไปที่เบราว์เซอร์</p></div><span className={`ai-state-pill${ai.ready ? " ready" : ""}`}><i />{ai.ready ? "พร้อมใช้งาน" : "ยังไม่พร้อม"}</span></div>

      <ul className="ai-setup-status" aria-label="สถานะการตั้งค่า AI">
        <Status ok={ai.apiKeyConfigured}>OpenAI API key ฝั่งเซิร์ฟเวอร์</Status>
        <Status ok={ai.modelConfigured}>โมเดลที่เลือก{ai.model ? ` (${ai.model})` : ""}</Status>
        <Status ok={budgetReady}>AI quota และราคาโมเดลใน Supabase</Status>
      </ul>

      <div className="ai-budget-box">
        <strong>โควตาและงบรวมของแอป</strong>
        {ai.policyConfigured && ai.dailyRequestsPerUser !== null && ai.globalDailySpendLimitUsd !== null ? (
          <p>
            {ai.dailyRequestsPerUser === 0
              ? "ไม่จำกัดจำนวนคำขอต่อบัญชีต่อวัน"
              : `ไม่เกิน ${ai.dailyRequestsPerUser} คำขอต่อบัญชีต่อวัน`}
            {ai.globalDailySpendLimitUsd === 0
              ? " · ไม่จำกัดงบรวมต่อวัน"
              : ` · งบรวมของแอปสูงสุด $${ai.globalDailySpendLimitUsd.toFixed(2)} ต่อวัน`}
          </p>
        ) : <p>ยังไม่พบการตั้งค่าโควตาและงบของแอป</p>}
        <small>ค่าใช้จ่ายในแอปเป็นค่าประมาณจากเรตราคาที่ตั้งใน Supabase โปรดตรวจยอดจริงใน OpenAI API Usage</small>
        {ai.inputRateUsdPerMillionTokens !== null && ai.cachedInputRateUsdPerMillionTokens !== null && ai.outputRateUsdPerMillionTokens !== null && <p className="ai-rate-note">เรทต่อ 1M tokens: input ${ai.inputRateUsdPerMillionTokens.toFixed(2)} · cached input ${ai.cachedInputRateUsdPerMillionTokens.toFixed(2)} · output ${ai.outputRateUsdPerMillionTokens.toFixed(2)}</p>}
      </div>

      <div className="ai-usage-box"><div><strong>OpenAI usage · วันนี้</strong><span>{usage.requests}{ai.dailyRequestsPerUser ? ` / ${ai.dailyRequestsPerUser}` : ""} คำขอ</span></div><p>Input {usage.inputTokens.toLocaleString("en-US")} · Output {usage.outputTokens.toLocaleString("en-US")} tokens</p><small>ค่าใช้จ่ายในแอปประมาณ ${usage.estimatedCost.toFixed(4)}{usage.reservedCost ? ` · กันวงเงินชั่วคราวอีกไม่เกิน $${usage.reservedCost.toFixed(4)}` : ""} · ตรวจยอดจริงจากหน้า Usage ในบัญชี OpenAI</small></div>

      <div className="ai-key-steps">
        <h3>เพิ่ม key ใน Vercel</h3>
        <ol>
          <li>เปิดหน้า Environment Variables ของโปรเจกต์ แล้วกด <strong>Add New</strong></li>
          <li>ใส่ชื่อ <code>OPENAI_API_KEY</code> วาง OpenAI key ในช่อง Value และเลือก <strong>Sensitive</strong></li>
          <li>เลือก environment ที่ต้องการใช้กับ key นี้ (<strong>Preview</strong> หรือ <strong>Production</strong>) แล้วกด Save</li>
          <li>ไปที่ Deployments แล้ว redeploy environment นั้นเพื่อโหลด key ฝั่งเซิร์ฟเวอร์</li>
        </ol>
        <p className="ai-key-warning">อย่าส่ง key ในแชตหรือใส่ในไฟล์ที่ขึ้น GitHub และอย่าเติม <code>NEXT_PUBLIC_</code> นำหน้าชื่อ key</p>
        <div className="ai-settings-actions">
          <a className="button-primary" href={vercelEnvironmentUrl} target="_blank" rel="noreferrer">วิธีตั้งค่า Environment Variables ใน Vercel <ArrowUpRight size={15} aria-hidden="true" /></a>
          {!budgetReady && <>
            <a className="button-secondary" href={supabaseSqlUrl} target="_blank" rel="noreferrer">เปิด Supabase Dashboard <ArrowUpRight size={15} aria-hidden="true" /></a>
            <a className="text-link ai-migration-link" href={migrationUrl} target="_blank" rel="noreferrer">เปิด SQL migration <ArrowUpRight size={15} aria-hidden="true" /></a>
          </>}
        </div>
        {!budgetReady && <p className="ai-migration-note">AI จะยังไม่เปิดจนกว่าจะตั้งค่า key และ apply migration <code>20261121000100_enable_openai_gpt6_luna.sql</code> ใน Supabase</p>}
      </div>
      <p className="ai-privacy-note">เมื่อกดส่ง ข้อความและภาพแนบจะถูกส่งไป OpenAI API ผ่านระบบของแอป ข้อมูลธุรกรรมและภาษีจะส่งเมื่อเลือกแนบข้อมูลช่วงที่เลือกเท่านั้น เป๋าวีนอาจร่างรายการให้ตรวจ แต่จะไม่บันทึกจนกว่าคุณยืนยัน ส่วนไฟล์ในเครื่อง ปฏิทินบิล และตัวช่วยซื้อในเครื่องจะไม่ถูกส่ง</p>
    </section>

    <section className="settings-card">
      <div className="settings-icon"><Download size={20} aria-hidden="true" /></div>
      <div><h2>ส่งออกข้อมูล</h2><p>ดาวน์โหลดรายการและข้อมูลเตรียมภาษีทั้งหมดของบัญชีนี้เป็นไฟล์ JSON</p></div>
      <a className="button-secondary" href="/api/export">ดาวน์โหลด JSON</a>
    </section>
    <section className="settings-card danger-zone">
      <div className="settings-icon"><Trash2 size={20} aria-hidden="true" /></div>
      <div><h2>ลบบัญชีและข้อมูล</h2><p>ลบบัญชี Paoween ของ {email} พร้อมโปรไฟล์ ธุรกรรม รายการภาษี และประวัติการใช้ AI ในแอป</p><small>ยืนยันตัวตนด้วย Google ก่อนลบ ข้อมูลที่ลบแล้วกู้คืนไม่ได้</small></div>
      <Link className="button-danger" href="/dashboard/settings/delete">จัดการการลบบัญชี</Link>
    </section>
  </div>;
}

"use client";

import { useMemo, useState } from "react";

const formatTHB = (amount: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(amount);

export function InvestmentSimulator() {
  const [monthly, setMonthly] = useState(5000);
  const [annualRate, setAnnualRate] = useState(5);
  const [years, setYears] = useState(5);
  const estimate = useMemo(() => {
    const months = years * 12;
    const monthlyRate = annualRate / 100 / 12;
    const total = monthly * months;
    const futureValue = Math.abs(monthlyRate) < 1e-12 ? total : monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    return { total, futureValue, difference: futureValue - total };
  }, [monthly, annualRate, years]);

  return <section className="panel simulator-panel" aria-labelledby="simulator-heading">
    <p className="eyebrow">WHAT-IF SIMULATOR</p><h2 id="simulator-heading">จำลองการลงทุน</h2>
    <p className="muted">ลองปรับสมมติฐานเพื่อดูตัวอย่างการทยอยลงทุน</p>
    <div className="simulator-fields">
      <label>ลงทุนต่อเดือน <span className="input-with-unit"><input type="number" min="1" max="10000000" step="500" value={monthly} onChange={(event) => setMonthly(Math.max(0, Number(event.target.value)))} /><i>บาท</i></span></label>
      <label>ผลตอบแทนสมมติต่อปี <span className="input-with-unit"><input type="number" min="-99" max="100" step="0.5" value={annualRate} onChange={(event) => setAnnualRate(Number(event.target.value))} /><i>%</i></span></label>
      <label>ระยะเวลา <select value={years} onChange={(event) => setYears(Number(event.target.value))}>{[1, 3, 5, 10, 20, 30].map((value) => <option key={value} value={value}>{value} ปี</option>)}</select></label>
    </div>
    <div className="simulator-results" aria-live="polite">
      <div><span>เงินที่ใส่รวม</span><strong>{formatTHB(estimate.total)}</strong></div>
      <div><span>มูลค่าตามสมมติฐาน</span><strong>{formatTHB(estimate.futureValue)}</strong></div>
      <div><span>ส่วนต่างจากเงินต้น</span><strong className={estimate.difference >= 0 ? "simulator-positive" : "simulator-negative"}>{estimate.difference >= 0 ? "+" : "−"}{formatTHB(Math.abs(estimate.difference))}</strong></div>
    </div>
    <p className="small-note">เป็นเพียงตัวอย่างสมมติ คิดจากลงทุนปลายเดือนและผลตอบแทนคงที่ทุกเดือน ก่อนค่าธรรมเนียม ภาษี และอัตราแลกเปลี่ยน ไม่ใช่คำแนะนำหรือการรับประกันผลตอบแทน</p>
  </section>;
}

"use client";

import { useState } from "react";
import { simulateInvestment, simulatorLimits } from "@/lib/finance/investment";

const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 });

export function InvestmentSimulator() {
  const [monthly, setMonthly] = useState("5000");
  const [annualRate, setAnnualRate] = useState("5");
  const [years, setYears] = useState(5);
  const { monthlyValid, rateValid, estimate } = simulateInvestment(monthly, annualRate, years);

  return <section className="panel simulator-panel" aria-labelledby="simulator-heading">
    <h2 id="simulator-heading">จำลองการลงทุน</h2>
    <p className="muted">ปรับเงินที่ลงทุนแต่ละเดือน ระยะเวลา และผลตอบแทนสมมติ</p>
    <div className="simulator-fields">
      <label>
        ลงทุนต่อเดือน
        <span className="input-with-unit">
          <input type="number" inputMode="decimal" min={simulatorLimits.monthly.min} max={simulatorLimits.monthly.max} step="any"
            value={monthly} onChange={(event) => setMonthly(event.target.value)} aria-invalid={!monthlyValid}
            aria-describedby={monthlyValid ? undefined : "simulator-monthly-error"} />
          <i>บาท</i>
        </span>
        {!monthlyValid && <span className="field-error" id="simulator-monthly-error">ใส่จำนวนเงินตั้งแต่ 1 ถึง 10,000,000 บาท</span>}
      </label>
      <label>
        ผลตอบแทนสมมติต่อปี
        <span className="input-with-unit">
          <input type="number" min={simulatorLimits.annualRate.min} max={simulatorLimits.annualRate.max} step="any"
            value={annualRate} onChange={(event) => setAnnualRate(event.target.value)} aria-invalid={!rateValid}
            aria-describedby={rateValid ? undefined : "simulator-rate-error"} />
          <i>%</i>
        </span>
        {!rateValid && <span className="field-error" id="simulator-rate-error">ใส่ผลตอบแทนตั้งแต่ −99% ถึง 100%</span>}
      </label>
      <label>
        ระยะเวลา
        <select value={years} onChange={(event) => setYears(Number(event.target.value))}>
          {simulatorLimits.years.map((year) => <option key={year} value={year}>{year} ปี</option>)}
        </select>
      </label>
    </div>
    <div className="simulator-results" aria-live="polite">
      <div><span>เงินที่ใส่รวม</span><strong>{estimate ? thb.format(estimate.total) : "—"}</strong></div>
      <div><span>มูลค่าตามสมมติฐาน</span><strong>{estimate ? thb.format(estimate.futureValue) : "—"}</strong></div>
      <div>
        <span>ส่วนต่างจากเงินต้น</span>
        <strong className={estimate && estimate.difference < 0 ? "simulator-negative" : "simulator-positive"}>
          {estimate ? thb.format(estimate.difference) : "—"}
        </strong>
      </div>
    </div>
    <p className="small-note">ตัวอย่างนี้คำนวณจากการลงทุนปลายเดือนและผลตอบแทนคงที่ทุกเดือน ก่อนค่าธรรมเนียม ภาษี และผลจากอัตราแลกเปลี่ยน</p>
  </section>;
}

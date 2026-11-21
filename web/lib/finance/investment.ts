export const investmentDirections = ["buy", "sell"] as const;

export type InvestmentDirection = (typeof investmentDirections)[number];

export const investmentDirectionLabels: Record<InvestmentDirection, string> = {
  buy: "ซื้อ",
  sell: "ขาย",
};

type InvestmentFlow = {
  amount_thb: number | string;
  investment_direction: InvestmentDirection | null;
};

export function summarizeInvestment(rows: InvestmentFlow[]) {
  let buySatang = 0;
  let sellSatang = 0;
  let needsReview = 0;

  for (const row of rows) {
    const satang = Math.round(Number(row.amount_thb) * 100);
    if (row.investment_direction === "buy") buySatang += satang;
    else if (row.investment_direction === "sell") sellSatang += satang;
    else needsReview += 1;
  }

  return { buy: buySatang / 100, sell: sellSatang / 100, needsReview };
}

export const simulatorLimits = {
  monthly: { min: 1, max: 10_000_000 },
  annualRate: { min: -99, max: 100 },
  years: [1, 3, 5, 10, 20, 30],
};

export function simulateInvestment(monthlyInput: string, annualRateInput: string, years: number) {
  const monthly = Number(monthlyInput);
  const annualRate = Number(annualRateInput);
  const monthlyValid = monthlyInput.trim() !== "" && monthly >= simulatorLimits.monthly.min && monthly <= simulatorLimits.monthly.max;
  const rateValid = annualRateInput.trim() !== "" && annualRate >= simulatorLimits.annualRate.min && annualRate <= simulatorLimits.annualRate.max;

  if (!monthlyValid || !rateValid || !simulatorLimits.years.includes(years)) {
    return { monthlyValid, rateValid, estimate: null };
  }

  const months = years * 12;
  const monthlyRate = annualRate / 1200;
  const total = monthly * months;
  const futureValue = monthlyRate === 0 ? total : monthly * Math.expm1(months * Math.log1p(monthlyRate)) / monthlyRate;
  return { monthlyValid, rateValid, estimate: { total, futureValue, difference: futureValue - total } };
}

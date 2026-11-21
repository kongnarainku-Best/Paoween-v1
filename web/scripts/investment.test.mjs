import assert from "node:assert/strict";
import test from "node:test";
import { simulateInvestment, summarizeInvestment } from "../lib/finance/investment.ts";

test("reports buys and sells separately and sends unknown legacy directions to review", () => {
  const totals = summarizeInvestment([
    { amount_thb: "10000.00", investment_direction: "buy" },
    { amount_thb: "4000.00", investment_direction: "sell" },
    { amount_thb: "250.00", investment_direction: null },
  ]);

  assert.deepEqual(totals, { buy: 10_000, sell: 4_000, needsReview: 1 });
});

test("combines satang without displaying rounding artifacts", () => {
  const totals = summarizeInvestment([
    { amount_thb: "0.10", investment_direction: "buy" },
    { amount_thb: "0.20", investment_direction: "buy" },
    { amount_thb: "0.01", investment_direction: "sell" },
  ]);

  assert.deepEqual(totals, { buy: 0.3, sell: 0.01, needsReview: 0 });
});

test("preserves the principal at zero return and produces losses at negative return", () => {
  assert.deepEqual(simulateInvestment("1000", "0", 1).estimate, {
    total: 12_000,
    futureValue: 12_000,
    difference: 0,
  });

  const loss = simulateInvestment("1000", "-5", 1).estimate;
  assert.equal(loss.total, 12_000);
  assert.ok(loss.futureValue < loss.total);
  assert.ok(loss.difference < 0);

  const gain = simulateInvestment("1000", "5", 1).estimate;
  assert.ok(gain.futureValue > gain.total);
});

test("rejects blank, non-finite, out-of-range and unsupported simulator inputs", () => {
  for (const amount of ["", "0", "-1", "10000001", "Infinity", "NaN"]) {
    assert.deepEqual(simulateInvestment(amount, "0", 1), { monthlyValid: false, rateValid: true, estimate: null });
  }

  for (const rate of ["", " ", "-100", "100.01", "Infinity", "NaN"]) {
    assert.deepEqual(simulateInvestment("1000", rate, 1), { monthlyValid: true, rateValid: false, estimate: null });
  }

  assert.equal(simulateInvestment("1000", "0", 0).estimate, null);
  assert.ok(Number.isFinite(simulateInvestment("10000000", "100", 30).estimate.futureValue));
  assert.ok(Number.isFinite(simulateInvestment("1", "-99", 1).estimate.futureValue));
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildTaxContext, taxContextLimit } from "../lib/finance/tax-context.ts";
import { taxRecordSchema, transactionSchema } from "../lib/finance/validation.ts";

const salaryTaxRecord = {
  tax_year: 2568,
  record_type: "income",
  tax_category: "เงินเดือน ม.40(1)",
  amount_thb: "30000.00",
  document_status: "verified",
  review_status: "confirmed",
};

test("tax subtotals do not add source totals, rejected rows, withholding, or other years to income", () => {
  const context = buildTaxContext([
    salaryTaxRecord,
    { ...salaryTaxRecord, record_type: "income_total" },
    { ...salaryTaxRecord, record_type: "tax_paid", amount_thb: "1000.00" },
    { ...salaryTaxRecord, record_type: "deduction", amount_thb: "4000.00", review_status: "needs_review" },
    { ...salaryTaxRecord, record_type: "deduction_total", amount_thb: "4000.00" },
    { ...salaryTaxRecord, amount_thb: "20000.00", review_status: "rejected" },
    { ...salaryTaxRecord, tax_year: 2569 },
  ], "all", 7);
  assert.equal(context.sample_is_complete, true);
  assert.deepEqual(context.years.map((year) => year.tax_year), [2568, 2569]);
  const year = context.years[0];
  assert.deepEqual(year.detail_subtotals_thb.income, { confirmed: 30_000 });
  assert.deepEqual(year.detail_subtotals_thb.deduction, { needs_review: 4_000 });
  assert.deepEqual(year.detail_subtotals_thb.tax_paid, { confirmed: 1_000 });
  assert.equal(year.records_by_type.income_total[0].amount_thb, 30_000);
  assert.equal(year.records_by_type.deduction_total[0].amount_thb, 4_000);
});

test("the tax context keeps unknown amounts distinct from zero and flags a limited sample", () => {
  const unknown = { ...salaryTaxRecord, amount_thb: null, document_status: "missing", review_status: "needs_review" };
  const zero = { ...salaryTaxRecord, amount_thb: "0.00", record_type: "tax_paid" };
  const context = buildTaxContext([unknown, zero], 2568, taxContextLimit + 1);
  const year = context.years[0];
  assert.equal(context.sample_is_complete, false);
  assert.equal(year.records_by_type.income[0].amount_thb, null);
  assert.deepEqual(year.detail_subtotals_thb.income, {});
  assert.deepEqual(year.detail_subtotals_thb.tax_paid, { confirmed: 0 });
});

test("a cash deposit and its tax record retain separate amounts and the selected Buddhist year", () => {
  const transactionId = "0a87028d-b790-46f8-ac05-1d53c414ef28";
  const cashDeposit = transactionSchema.parse({
    transaction_date: "2025-12-31",
    transaction_type: "income",
    category: "Salary",
    description: "เงินเดือนสุทธิ",
    amount_thb: "28500.00",
    action: "",
  });
  const taxForm = { ...salaryTaxRecord, transaction_id: transactionId, source_reference: "", notes: "" };
  const pending = taxRecordSchema.parse({ ...taxForm, amount_thb: "", document_status: "missing", review_status: "needs_review" });
  const confirmed = taxRecordSchema.parse(taxForm);
  const context = buildTaxContext([confirmed, { ...confirmed, tax_year: 2569 }], 2568, 1);
  assert.equal(cashDeposit.amount_thb, 28_500);
  assert.equal(pending.amount_thb, null);
  assert.equal(confirmed.amount_thb, 30_000);
  assert.equal(confirmed.transaction_id, transactionId);
  assert.deepEqual(context.years.map((year) => year.tax_year), [2568]);
});

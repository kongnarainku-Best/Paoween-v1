import assert from "node:assert/strict";
import { test } from "node:test";

import { bangkokDate, pocketLabel } from "../lib/finance/pocket.ts";
import { transactionMatchKey } from "../lib/finance/transaction-match.ts";
import { transactionDraftSchema, transactionSchema } from "../lib/finance/validation.ts";

const wallet = "11111111-1111-4111-8111-111111111111";
const bank = "22222222-2222-4222-8222-222222222222";
const expense = {
  transaction_date: "2026-11-21",
  transaction_type: "expense",
  description: "อาหาร",
  amount_thb: "80.00",
  category: "Food/Beverage",
  action: "จ่ายเงินสด",
};

test("older and unassigned entries stay valid and hidden draft fields are cleared at save", () => {
  assert.deepEqual(transactionSchema.parse(expense), {
    ...expense, amount_thb: 80, investment_direction: null, pocket_id: null, destination_pocket_id: null,
  });
  const saved = transactionSchema.parse({ ...expense, investment_direction: "buy", pocket_id: wallet, destination_pocket_id: bank });
  assert.equal(saved.pocket_id, wallet);
  assert.equal(saved.destination_pocket_id, null);
  assert.equal(saved.investment_direction, null);
  assert.equal(saved.action, "จ่ายเงินสด");
});

test("a transfer can be drafted while incomplete and requires two different pockets to save", () => {
  const transfer = { ...expense, transaction_type: "transfer", description: "ถอนเงินสด", amount_thb: "1000" };
  assert.equal(transactionDraftSchema.safeParse(transfer).success, true);
  assert.equal(transactionSchema.safeParse(transfer).success, false);
  assert.equal(transactionSchema.safeParse({ ...transfer, pocket_id: bank, destination_pocket_id: bank }).success, false);
  assert.equal(transactionSchema.parse({ ...transfer, pocket_id: bank, destination_pocket_id: wallet }).destination_pocket_id, wallet);
});

test("direction is required before saving an investment and is separate from notes", () => {
  const draft = { ...expense, transaction_type: "investment", action: "หุ้น A" };
  assert.equal(transactionDraftSchema.safeParse(draft).success, true);
  assert.equal(transactionSchema.safeParse(draft).success, false);
  const saved = transactionSchema.parse({ ...draft, investment_direction: "sell" });
  assert.equal(saved.investment_direction, "sell");
  assert.equal(saved.action, "หุ้น A");
  assert.equal(pocketLabel("investment", "sell"), "เงินเข้ากระเป๋า");
});

test("duplicate matching keeps directions and pockets distinct", () => {
  assert.notEqual(transactionMatchKey(expense), transactionMatchKey({ ...expense, pocket_id: wallet }));
  const transfer = { ...expense, transaction_type: "transfer", pocket_id: wallet, destination_pocket_id: bank };
  assert.notEqual(transactionMatchKey(transfer), transactionMatchKey({ ...transfer, pocket_id: bank, destination_pocket_id: wallet }));
  const buy = { ...expense, transaction_type: "investment", investment_direction: "buy" };
  assert.notEqual(transactionMatchKey(buy), transactionMatchKey({ ...buy, investment_direction: "sell" }));
});

test("an opening day switches at midnight in Bangkok", () => {
  assert.equal(bangkokDate(new Date("2026-11-20T16:59:59Z")), "2026-11-20");
  assert.equal(bangkokDate(new Date("2026-11-20T17:00:00Z")), "2026-11-21");
});

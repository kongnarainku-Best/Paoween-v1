import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistantHistory } from "../lib/finance/assistant-history.ts";

const scope = { year: "2026", month: "11", includeFinanceData: false };
const pair = (question, answer, context = null) => [
  { role: "user", content: question },
  { role: "assistant", content: answer, completed: true, context },
];

test("keeps complete AI exchanges and drops local navigation and failed exchanges", () => {
  const messages = [
    ...pair("จำคำว่า เมฆฟ้า 27", "ได้ครับ"),
    { role: "user", content: "พาไปหน้ารายจ่าย" },
    { role: "assistant", content: "เปิดหน้ารายจ่ายแล้วครับ" },
    { role: "user", content: "ส่งไม่สำเร็จ 1" },
    { role: "user", content: "ส่งไม่สำเร็จ 2" },
    { role: "assistant", content: "ข้อความที่ตอบไม่จบ" },
    ...pair("มีนาคมเดือนที่เท่าไร", "เดือนที่ 3 ครับ"),
  ];

  assert.deepEqual(buildAssistantHistory(messages, scope).map(({ content }) => content), [
    "จำคำว่า เมฆฟ้า 27", "ได้ครับ", "มีนาคมเดือนที่เท่าไร", "เดือนที่ 3 ครับ",
  ]);
});

test("omits account context after opt-out or a change of period", () => {
  const messages = [
    ...pair("ข้อมูลบัญชีเดือนนี้", "ข้อมูลสมมติส่วนตัว", { year: "2026", month: "11" }),
    ...pair("คำถามทั่วไป", "คำตอบทั่วไป"),
  ];
  assert.equal(buildAssistantHistory(messages, scope).length, 2);
  assert.equal(buildAssistantHistory(messages, { ...scope, includeFinanceData: true, month: "10" }).length, 2);
  assert.equal(buildAssistantHistory(messages, { ...scope, includeFinanceData: true }).length, 4);
});

test("keeps at most four pairs and caps the serialized history at 4,800 characters", () => {
  const history = buildAssistantHistory(
    Array.from({ length: 6 }, (_, index) => pair("ก".repeat(700) + index, "ข".repeat(700))).flat(),
    scope,
  );
  assert.equal(history.length, 8);
  assert.equal(history[0].content.at(-1), "2");
  assert.equal(history.reduce((length, item) => length + item.content.length, 0), 4_800);
});

test("includes draft fields and an attachment marker while leaving out image bytes", () => {
  const messages = pair("อ่านสลิปนี้", "ร่างไว้แล้วครับ");
  messages[0].attachment = { dataUrl: "test bytes" };
  messages[1].proposal = {
    transaction_date: "2026-11-20", transaction_type: "expense",
    description: "กาแฟ", amount_thb: "125", category: "Food/Beverage", action: "ทดสอบ",
  };
  const history = buildAssistantHistory(messages, scope);
  assert.match(history[0].content, /ไม่ได้ส่งภาพนั้นซ้ำ/);
  assert.doesNotMatch(history[0].content, /test bytes/);
  assert.match(history[1].content, /ยอด 125 บาท.*หมายเหตุ ทดสอบ/);
});

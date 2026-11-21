import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { buildAssistantHistory } from "../lib/finance/assistant-history.ts";
import { assistantOutputSchema, buildAssistantPrompt } from "../lib/finance/assistant-prompt.ts";
import { transactionCategories, transactionSchema } from "../lib/finance/validation.ts";

const scope = { year: "2026", month: "11", includeFinanceData: false };
const scopeLabel = "tax year 2569 / month 11";
const accountContext = "No transaction records were shared for this message. Give general guidance and say when account-specific details are needed.";
const date = "2026-11-21";
const thaiSentences = new Intl.Segmenter("th", { granularity: "sentence" });
const draft = {
  transaction_date: "2026-11-20",
  transaction_type: "expense",
  description: "กาแฟร้านตัวอย่าง",
  amount_thb: "125",
  category: "Food/Beverage",
  action: "",
};
const exchange = (question, answer, extras) => [
  { role: "user", content: question },
  { role: "assistant", content: answer, completed: true, ...extras },
];
const shortReply = (reply) =>
  reply.trim().length <= 150
  && reply.trim().split(/\n+/).length <= 2
  && [...thaiSentences.segment(reply.trim())].length <= 2;
const draftMatches = (proposal, amount) =>
  transactionSchema.safeParse(proposal).success
  && Number(proposal.amount_thb) === amount
  && proposal.transaction_date === draft.transaction_date
  && proposal.transaction_type === draft.transaction_type
  && /กาแฟ.*ร้านตัวอย่าง/.test(proposal.description)
  && proposal.category === draft.category;
const scalarReply = (answer, pattern) =>
  answer.transaction_proposal === null && pattern.test(answer.reply) && shortReply(answer.reply);

const scenarios = [
  { name: "short arithmetic", message: "มีงบ 1,800 บาท ใช้ไป 450 บาท เหลือเท่าไหร่ครับ?", check: (answer) => scalarReply(answer, /1,?350/) },
  { name: "simple explanation", message: "โอนเงินระหว่างบัญชีของตัวเอง นับเป็นรายจ่ายไหม?", check: (answer) => scalarReply(answer, /ไม่นับ|ไม่ถือ|ไม่ใช่/) },
  { name: "no account access", message: "เดือนนี้ผมจ่ายค่าอาหารรวมเท่าไหร่?", check: (answer) => scalarReply(answer, /ยังไม่|ไม่มีข้อมูล|ไม่ได้รับ/) && /แนบ|แชร์|ส่ง/.test(answer.reply) },
  { name: "details on request", message: "อธิบายวิธีเริ่มจัดงบรายเดือนสำหรับมือใหม่ 3 ข้อ ขอเป็น bullet สั้น ๆ", check: (answer) => answer.transaction_proposal === null && (answer.reply.match(/^\s*(?:[-•]|[1-3][.)])\s+/gm) ?? []).length === 3 },
  {
    name: "recall after navigation",
    history: [
      ...exchange("ฝากจำคำว่า เมฆฟ้า 27 ให้หน่อย", "ได้ครับ"),
      ...exchange("เดือนมีนาคมคือเดือนที่เท่าไหร่", "เดือนที่ 3 ครับ"),
      { role: "user", content: "พาไปหน้ารายจ่าย" },
      { role: "assistant", content: "เปิดหน้ารายจ่ายให้แล้วครับ" },
    ],
    message: "ผมฝากจำคำว่าอะไรครับ?",
    check: (answer) => scalarReply(answer, /เมฆฟ้า\s*27/),
  },
  { name: "draft from text", message: "ร่างรายการวันที่ 20 พ.ย. 2569 ซื้อกาแฟร้านตัวอย่าง 125 บาท หมวด Food/Beverage ครับ", check: (answer) => draftMatches(answer.transaction_proposal, 125) && shortReply(answer.reply) },
  {
    name: "update draft amount",
    history: exchange("ร่างรายการกาแฟร้านตัวอย่าง 125 บาท วันที่ 20 พ.ย. 2569 หมวด Food/Beverage", "ร่างไว้แล้วครับ", { proposal: draft }),
    message: "แก้ยอดร่างเดิมเป็น 135 บาท รายละเอียดอื่นคงเดิม",
    check: (answer) => draftMatches(answer.transaction_proposal, 135) && shortReply(answer.reply),
  },
  { name: "receipt with obscured total", message: "ช่วยอ่านสลิปและร่างรายการนี้ครับ", image: true, check: (answer) => scalarReply(answer, /ยอด|จำนวนเงิน|กี่บาท/) },
];

const baselinePath = process.argv[2];
const versions = [];
if (baselinePath) {
  const previous = JSON.parse(await readFile(baselinePath, "utf8"));
  const baselinePrompt = [
    previous.assistantInstructions,
    `Current date in Asia/Bangkok: ${date}. User-selected period: ${scopeLabel}. Account snapshot (only when the user opted in): ${accountContext}`,
    "Return only one valid JSON object. Do not wrap it in Markdown or add text outside it. It must match this JSON schema exactly:",
    JSON.stringify(previous.assistantOutputSchema),
  ].join("\n\n");
  versions.push({
    name: "baseline",
    systemPrompt: baselinePrompt,
    schema: previous.assistantOutputSchema,
    history: (messages) => messages.slice(-4).map(({ role, content, proposal }) => ({
      role,
      content: proposal
        ? `${content}\n[รายการร่างจากแชตก่อนหน้า ยังไม่ยืนยันว่าบันทึกแล้ว: วันที่ ${proposal.transaction_date}; ประเภท ${proposal.transaction_type}; รายการ ${proposal.description}; จำนวน ${proposal.amount_thb} บาท; หมวดหมู่ ${proposal.category}.]`
        : content,
    })),
  });
}
versions.push({
  name: "candidate",
  systemPrompt: buildAssistantPrompt({ categories: transactionCategories, date, scopeLabel, accountContext }),
  schema: assistantOutputSchema,
  history: (messages) => buildAssistantHistory(messages, scope),
});

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY in the environment before running the live evaluation.");
  process.exit(1);
}
const model = process.env.OPENAI_MODEL?.trim() || "gpt-6-luna";
const client = new OpenAI({ timeout: 55_000, maxRetries: 0 });
const image = await readFile(new URL("./fixtures/receipt-missing-amount.png", import.meta.url));
const imageUrl = "data:image/png;base64," + image.toString("base64");

for (const version of versions) {
  let passed = 0;
  for (const scenario of scenarios) {
    try {
      const content = [{ type: "input_text", text: scenario.message }];
      if (scenario.image) content.push({ type: "input_image", image_url: imageUrl, detail: "high" });
      const startedAt = performance.now();
      const stream = client.responses.stream({
        model,
        store: false,
        reasoning: { effort: "medium" },
        max_output_tokens: 1_200,
        input: [
          { role: "system", content: [{ type: "input_text", text: version.systemPrompt }] },
          ...version.history(scenario.history ?? []),
          { role: "user", content },
        ],
        text: { format: { type: "json_schema", name: "paoween_finance_reply", strict: true, schema: version.schema } },
      });
      let firstDeltaMs = null;
      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && firstDeltaMs === null) {
          firstDeltaMs = Math.round(performance.now() - startedAt);
        }
      }
      const result = await stream.finalResponse();
      if (result.status !== "completed") throw new Error(result.status);
      const answer = JSON.parse(result.output_text);
      const pass = firstDeltaMs !== null && scenario.check(answer);
      if (pass) passed++;
      console.log(JSON.stringify({
        version: version.name, name: scenario.name, pass, reply: answer.reply,
        proposal: answer.transaction_proposal, chars: answer.reply.length,
        firstDeltaMs, totalMs: Math.round(performance.now() - startedAt),
      }));
    } catch (error) {
      console.log(JSON.stringify({
        version: version.name, name: scenario.name, pass: false,
        status: error.status, code: error.code, error: error.name,
      }));
    }
  }
  console.log(`${version.name}: ${passed}/${scenarios.length} on ${model}`);
  if (version.name === "candidate" && passed !== scenarios.length) process.exitCode = 1;
}

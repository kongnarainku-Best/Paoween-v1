import { z } from "zod";

import { assistantPages } from "./assistant-prompt";
export { assistantPages };

export const assistantPageSchema = z.enum(Object.keys(assistantPages) as [keyof typeof assistantPages, ...(keyof typeof assistantPages)[]]);
export const proposalSchema = z.object({
  transaction_date: z.string().max(20),
  transaction_type: z.enum(["income", "expense", "investment", "transfer"]),
  description: z.string().max(240),
  amount_thb: z.string().max(32),
  category: z.string().max(80),
  action: z.string().max(240),
}).strict();
export type TransactionProposal = z.infer<typeof proposalSchema>;

export const draftNumberSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const draftEditSchema = z.object({
  number: draftNumberSchema,
  changes: proposalSchema.partial().strict(),
}).strict();
export type DraftEdit = z.infer<typeof draftEditSchema>;
export const assistantNavigationSchema = z.object({
  page: assistantPageSchema,
  month: z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/).nullable(),
  taxYear: z.number().int().min(2400).max(2700).nullable(),
}).strict();
export type AssistantNavigation = z.infer<typeof assistantNavigationSchema>;

export function navigationHref({ page, month, taxYear }: AssistantNavigation) {
  const { href } = assistantPages[page];
  if ((page === "spending" || page === "transactions") && month) return `${href}?month=${month}`;
  if (page === "tax" && taxYear) return `${href}?year=${taxYear}`;
  return href;
}

export function isBatchConfirmation(message: string) {
  const text = message.normalize("NFKC").toLowerCase().replace(/[\s.!。！]+/gu, "");
  return /^(?:(?:โอเค|ตกลง)?(?:ขอ|ช่วย)?(?:ยืนยัน(?:บันทึก)?|บันทึก|เซฟ)(?:รายการ|สลิป)?(?:ทั้งหมด|ทุก(?:รายการ|สลิป|ใบ)(?:ในแชต)?|ให้หมด)?(?:ได้เลย|เลย|แล้ว)?(?:นะ)?(?:ครับ|คะ|ค่ะ)?|(?:please)?(?:confirm(?:all)?|saveall)(?:please)?)$/u.test(text);
}

export function isDuplicateConfirmation(message: string) {
  const text = message.normalize("NFKC").replace(/[\s.!。！]+/gu, "");
  return /^(?:ยืนยัน)?บันทึกซ้ำ(?:ทั้งหมด)?(?:เลย)?(?:ครับ|คะ|ค่ะ)?$/u.test(text);
}

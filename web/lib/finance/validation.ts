import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "กรุณาเลือกวันที่ที่ถูกต้อง");

const optionalPocketId = z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((value) => value || null);

export const transactionDraftSchema = z.object({
  transaction_date: isoDate,
  transaction_type: z.enum(["income", "expense", "investment", "transfer"], { error: "เลือกประเภทรายการ" }),
  description: z.string().trim().min(1, "กรอกรายละเอียดรายการ").max(240, "รายละเอียดต้องไม่เกิน 240 ตัวอักษร"),
  amount_thb: z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "จำนวนเงินต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง")
    .transform(Number).pipe(z.number().finite().gt(0, "จำนวนเงินต้องมากกว่า 0").max(999999999999.99, "จำนวนเงินมากเกินไป")),
  category: z.string().trim().min(1, "กรอกหมวดหมู่").max(80, "หมวดหมู่ต้องไม่เกิน 80 ตัวอักษร"),
  action: z.string().trim().max(240, "หมายเหตุต้องไม่เกิน 240 ตัวอักษร").transform((value) => value || null),
  investment_direction: z.union([z.enum(["buy", "sell"]), z.literal(""), z.null()]).optional().transform((value) => value || null),
  pocket_id: optionalPocketId,
  destination_pocket_id: optionalPocketId,
});

export const transactionSchema = transactionDraftSchema.superRefine((value, context) => {
  if (value.transaction_type === "investment" && !value.investment_direction) {
    context.addIssue({ code: "custom", path: ["investment_direction"], message: "เลือกว่าซื้อหรือขาย" });
  }
  if (value.transaction_type === "transfer") {
    if (!value.pocket_id) context.addIssue({ code: "custom", path: ["pocket_id"], message: "เลือกกระเป๋าต้นทาง" });
    if (!value.destination_pocket_id || value.destination_pocket_id === value.pocket_id) {
      context.addIssue({ code: "custom", path: ["destination_pocket_id"], message: "เลือกกระเป๋าปลายทางที่ต่างจากต้นทาง" });
    }
  }
}).transform((value) => ({
  ...value,
  investment_direction: value.transaction_type === "investment" ? value.investment_direction : null,
  destination_pocket_id: value.transaction_type === "transfer" ? value.destination_pocket_id : null,
}));

export const taxRecordSchema = z.object({
  transaction_id: z.string().uuid("เลือกรายการที่ถูกต้อง").or(z.literal("")).transform((value) => value || null),
  tax_year: z.coerce.number().int().min(2400, "ปีภาษีไม่ถูกต้อง").max(2700, "ปีภาษีไม่ถูกต้อง"),
  record_type: z.enum(["income", "income_total", "deduction", "deduction_total", "tax_paid", "taxable_income", "tax_estimate", "tax_saving"], { error: "เลือกประเภทรายการภาษี" }),
  tax_category: z.string().trim().min(1, "กรอกชื่อรายการภาษี").max(120, "ชื่อรายการต้องไม่เกิน 120 ตัวอักษร"),
  amount_thb: z.preprocess((value) => value === "" || value === null ? null : value,
    z.union([
      z.null(),
      z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "จำนวนเงินต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง")
        .transform(Number).pipe(z.number().finite().min(0, "จำนวนเงินต้องไม่ติดลบ").max(999999999999.99, "จำนวนเงินมากเกินไป")),
    ])),
  source_reference: z.string().trim().max(500, "แหล่งอ้างอิงยาวเกินไป").transform((value) => value || null),
  document_status: z.enum(["missing", "provided", "verified", "not_applicable"], { error: "เลือกสถานะเอกสาร" }),
  review_status: z.enum(["needs_review", "confirmed", "rejected"], { error: "เลือกสถานะตรวจสอบ" }),
  notes: z.string().trim().max(2000, "หมายเหตุต้องไม่เกิน 2,000 ตัวอักษร").transform((value) => value || null),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type TaxRecordInput = z.infer<typeof taxRecordSchema>;

export const transactionCategories = [
  "Food/Beverage", "Shopping", "Other", "Transportation", "Hotel", "AI", "Telephone",
  "Transfer money", "Health_fries", "Medicine", "Money left", "Skin care", "Bio neighborhood",
  "Hair cut", "icloud", "Salary", "My_people", "Freelance", "Homies_โอนคืน", "Money_left",
  "other account transfer", "Fund", "Stocks", "Bitcoin", "Savings",
];

export const transactionTypeLabels: Record<TransactionInput["transaction_type"], string> = {
  income: "รายรับ",
  expense: "รายจ่าย",
  investment: "ลงทุน",
  transfer: "โอนระหว่างบัญชี",
};

export const taxRecordTypeLabels: Record<TaxRecordInput["record_type"], string> = {
  income: "รายได้",
  income_total: "ยอดรวมรายได้จากต้นทาง",
  deduction: "รายการลดหย่อน",
  deduction_total: "ยอดรวมลดหย่อนจากต้นทาง",
  tax_paid: "ภาษีที่จ่ายแล้ว",
  taxable_income: "เงินได้สุทธิ",
  tax_estimate: "ประมาณการภาษี",
  tax_saving: "ภาษีที่ประหยัดได้",
};

export const documentStatusLabels: Record<TaxRecordInput["document_status"], string> = {
  missing: "ยังไม่มีเอกสาร",
  provided: "มีเอกสารแล้ว",
  verified: "ตรวจเอกสารแล้ว",
  not_applicable: "ไม่เกี่ยวข้อง",
};

export const reviewStatusLabels: Record<TaxRecordInput["review_status"], string> = {
  needs_review: "รอตรวจสอบ",
  confirmed: "ยืนยันแล้ว",
  rejected: "ไม่รับรายการ",
};

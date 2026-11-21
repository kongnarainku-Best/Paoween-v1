import { z } from "zod";
import { revalidatePath } from "next/cache";

import { transactionSchema } from "@/lib/finance/validation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  proposalId: z.string().uuid(),
  proposal: z.object({
    transaction_date: z.string(),
    transaction_type: z.enum(["income", "expense", "investment", "transfer"]),
    description: z.string(),
    amount_thb: z.string(),
    category: z.string(),
    action: z.string(),
  }).strict(),
  allowDuplicate: z.boolean().default(false),
}).strict();

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Authentication is not configured." }, { status: 503 });

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_000) return Response.json({ error: "Proposal is too large." }, { status: 413 });

  let rawBody: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 8_000) return Response.json({ error: "Proposal is too large." }, { status: 413 });
    rawBody = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) return Response.json({ error: "รายการที่ร่างไว้ไม่ถูกต้อง กรุณาขอให้เป๋าวีนร่างใหม่" }, { status: 400 });
  const transaction = transactionSchema.safeParse({ ...parsed.data.proposal, action: parsed.data.proposal.action });
  if (!transaction.success) return Response.json({ error: "รายละเอียดรายการไม่ครบหรือไม่ถูกต้อง กรุณาแก้รายละเอียดในแชตก่อนบันทึก" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (authError || typeof userId !== "string") return Response.json({ error: "ลงชื่อเข้าใช้ก่อนบันทึกรายการนะ" }, { status: 401 });

  const sourceReference = `Paoween AI proposal ${parsed.data.proposalId}`;
  const existingProposal = await supabase.from("transactions").select("id")
    .eq("user_id", userId).eq("source_reference", sourceReference).maybeSingle();
  if (existingProposal.error) return Response.json({ error: "ตรวจสอบรายการเดิมไม่สำเร็จ ลองอีกครั้งนะ" }, { status: 503 });
  if (existingProposal.data) return Response.json({ saved: true, transactionId: existingProposal.data.id, alreadySaved: true });

  const duplicate = await supabase.from("transactions").select("id")
    .eq("user_id", userId)
    .eq("transaction_date", transaction.data.transaction_date)
    .eq("transaction_type", transaction.data.transaction_type)
    .eq("description", transaction.data.description)
    .eq("amount_thb", transaction.data.amount_thb)
    .limit(1).maybeSingle();
  if (duplicate.error) return Response.json({ error: "ตรวจรายการซ้ำไม่สำเร็จ ลองอีกครั้งนะ" }, { status: 503 });
  if (duplicate.data && !parsed.data.allowDuplicate) return Response.json({ duplicate: true }, { status: 409 });

  const { data, error } = await supabase.from("transactions").insert({
    ...transaction.data,
    user_id: userId,
    source: "manual_entry",
    source_reference: sourceReference,
  }).select("id").single();
  if (error || !data) return Response.json({ error: "บันทึกรายการไม่สำเร็จ ลองอีกครั้งนะ" }, { status: 503 });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  return Response.json({ saved: true, transactionId: data.id });
}

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { proposalSchema } from "@/lib/finance/assistant-actions";
import { findAssistantDuplicate } from "@/lib/finance/assistant-duplicates";
import { transactionSchema } from "@/lib/finance/validation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  proposalId: z.string().uuid(),
  proposal: proposalSchema,
  edit: z.object({
    transactionId: z.string().uuid(),
    updatedAt: z.iso.datetime({ offset: true }),
  }).strict().optional(),
  allowDuplicate: z.boolean().optional(),
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
  const transaction = transactionSchema.safeParse(parsed.data.proposal);
  if (!transaction.success) return Response.json({ error: "รายละเอียดรายการไม่ครบหรือไม่ถูกต้อง กรุณาแก้รายละเอียดในแชตก่อนบันทึก" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (authError || typeof userId !== "string") return Response.json({ error: "ลงชื่อเข้าใช้ก่อนบันทึกรายการนะ" }, { status: 401 });

  const sourceReference = `Paoween AI proposal ${parsed.data.proposalId}`;
  const edit = parsed.data.edit;
  const findSavedProposal = () => supabase.from("transactions")
    .select("id,updated_at,transaction_date,transaction_type,description,amount_thb,category,action")
    .eq("user_id", userId).eq("source_reference", sourceReference).maybeSingle();
  const savedResponse = (row: { id: string; updated_at: string }) =>
    Response.json({ saved: true, transactionId: row.id, updatedAt: row.updated_at });
  const existing = await findSavedProposal();
  if (existing.error) return Response.json({ error: "ตรวจสอบรายการเดิมไม่สำเร็จ ลองอีกครั้งนะ" }, { status: 503 });
  if (!edit && existing.data) return savedResponse(existing.data);

  const conflict = () => Response.json({ error: "รายการนี้เปลี่ยนไปแล้ว กรุณาเปิดหน้ารายการเพื่อตรวจและแก้ไขอีกครั้ง" }, { status: 409 });
  if (edit) {
    if (!existing.data || existing.data.id !== edit.transactionId) return conflict();
    if (existing.data.updated_at !== edit.updatedAt) {
      const row = existing.data;
      const data = transaction.data;
      const alreadyApplied = row.transaction_date === data.transaction_date
        && row.transaction_type === data.transaction_type && row.description === data.description
        && Number(row.amount_thb) === data.amount_thb && row.category === data.category && row.action === data.action;
      return alreadyApplied ? savedResponse(row) : conflict();
    }
  }

  const duplicate = await findAssistantDuplicate(supabase, userId, transaction.data, edit?.transactionId);
  if (duplicate.error) return Response.json({ error: "ตรวจรายการซ้ำไม่สำเร็จ ลองอีกครั้งนะ" }, { status: 503 });
  if (duplicate.duplicate) return Response.json({ duplicate: true }, { status: 409 });

  const operation = edit ? supabase.from("transactions").update(transaction.data)
    .eq("user_id", userId).eq("id", edit.transactionId).eq("updated_at", edit.updatedAt)
    .eq("source_reference", sourceReference) : supabase.from("transactions").insert({
    ...transaction.data,
    id: parsed.data.proposalId,
    user_id: userId,
    source: "manual_entry",
    source_reference: sourceReference,
  });
  const { data, error } = await operation.select("id,updated_at").maybeSingle();
  if (edit && !error && !data) return conflict();
  if (!edit && error?.code === "23505") {
    const retry = await findSavedProposal();
    if (retry.data) return savedResponse(retry.data);
  }
  if (error || !data) return Response.json({ error: "บันทึกรายการไม่สำเร็จ ลองอีกครั้งนะ" }, { status: 503 });

  revalidatePath("/dashboard", "layout");
  return savedResponse(data);
}

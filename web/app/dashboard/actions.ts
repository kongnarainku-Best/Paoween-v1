"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createDeletionProof, deletionCookieOptions, deletionGrantCookie, deletionReauthCookie, hasDeletionGrant } from "@/lib/finance/account-deletion";
import { readFormString, stateFromIssues, type FinanceFormState } from "@/lib/finance/form-state";
import { getSignedInUser } from "@/lib/finance/server";
import { taxRecordSchema, transactionSchema, type TransactionInput } from "@/lib/finance/validation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServiceClient } from "@/lib/supabase/service";

function transactionData(formData: FormData) {
  return {
    transaction_date: readFormString(formData, "transaction_date"),
    transaction_type: readFormString(formData, "transaction_type"),
    description: readFormString(formData, "description"),
    amount_thb: readFormString(formData, "amount_thb"),
    category: readFormString(formData, "category"),
    action: readFormString(formData, "action"),
    investment_direction: readFormString(formData, "investment_direction"),
    pocket_id: readFormString(formData, "pocket_id"),
    destination_pocket_id: readFormString(formData, "destination_pocket_id"),
  };
}

function taxRecordData(formData: FormData) {
  return {
    transaction_id: readFormString(formData, "transaction_id"),
    tax_year: readFormString(formData, "tax_year"),
    record_type: readFormString(formData, "record_type"),
    tax_category: readFormString(formData, "tax_category"),
    amount_thb: readFormString(formData, "amount_thb"),
    source_reference: readFormString(formData, "source_reference"),
    document_status: readFormString(formData, "document_status"),
    review_status: readFormString(formData, "review_status"),
    notes: readFormString(formData, "notes"),
  };
}

async function isDuplicateTransaction(
  supabase: Awaited<ReturnType<typeof getSignedInUser>>["supabase"],
  userId: string,
  input: TransactionInput,
  exceptId?: string,
) {
  let query = supabase.from("transactions").select("id").eq("user_id", userId)
    .eq("transaction_date", input.transaction_date)
    .eq("transaction_type", input.transaction_type)
    .eq("description", input.description)
    .eq("amount_thb", input.amount_thb).limit(1);
  for (const field of ["investment_direction", "pocket_id", "destination_pocket_id"] as const) {
    const value = input[field];
    if (value) query = query.or(`${field}.eq.${value},${field}.is.null`);
  }
  if (exceptId) query = query.neq("id", exceptId);
  return query.maybeSingle();
}

export async function createTransactionAction(_state: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { supabase, userId } = await getSignedInUser();
  const parsed = transactionSchema.safeParse(transactionData(formData));
  if (!parsed.success) return stateFromIssues(parsed.error.issues);

  const id = readFormString(formData, "submission_id");
  if (!zodUuid(id)) return { error: "ฟอร์มหมดอายุ กรุณาโหลดหน้าใหม่", fieldErrors: {} };
  const findSubmission = () => supabase.from("transactions").select("id").eq("user_id", userId).eq("id", id).maybeSingle();
  const existing = await findSubmission();
  if (existing.error) return { error: "ตรวจสอบรายการเดิมไม่สำเร็จ กรุณาลองอีกครั้ง", fieldErrors: {} };
  if (existing.data) redirect("/dashboard/transactions?saved=created");

  const duplicate = await isDuplicateTransaction(supabase, userId, parsed.data);
  if (duplicate.error) return { error: "ตรวจรายการซ้ำไม่สำเร็จ กรุณาลองอีกครั้ง", fieldErrors: {} };
  if (duplicate.data && readFormString(formData, "allow_duplicate") !== "yes") {
    if ((await findSubmission()).data) redirect("/dashboard/transactions?saved=created");
    return { error: "พบรายการที่มีวัน ประเภท จำนวนเงิน และคำอธิบายตรงกัน กรุณาตรวจสอบก่อนบันทึกซ้ำ", fieldErrors: {}, duplicate: true };
  }

  const { error } = await supabase.from("transactions").insert({
    ...parsed.data,
    id,
    user_id: userId,
    source: "manual_entry",
  });
  if (error?.code === "23505" && (await findSubmission()).data) {
    revalidatePath("/dashboard", "layout");
    redirect("/dashboard/transactions?saved=created");
  }
  if (error) return { error: "บันทึกรายการไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองอีกครั้ง", fieldErrors: {} };
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/transactions?saved=created");
}

export async function updateTransactionAction(_state: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { supabase, userId } = await getSignedInUser();
  const id = readFormString(formData, "id");
  if (!zodUuid(id)) return { error: "ไม่พบรายการที่ต้องการแก้ไข", fieldErrors: {} };
  const parsed = transactionSchema.safeParse(transactionData(formData));
  if (!parsed.success) return stateFromIssues(parsed.error.issues);

  const duplicate = await isDuplicateTransaction(supabase, userId, parsed.data, id);
  if (duplicate.error) return { error: "ตรวจรายการซ้ำไม่สำเร็จ กรุณาลองอีกครั้ง", fieldErrors: {} };
  if (duplicate.data && readFormString(formData, "allow_duplicate") !== "yes") {
    return { error: "พบรายการอื่นที่มีวัน ประเภท จำนวนเงิน และคำอธิบายตรงกัน กรุณาตรวจสอบก่อนบันทึก", fieldErrors: {}, duplicate: true };
  }

  const { data, error } = await supabase.from("transactions").update(parsed.data).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error || !data) return { error: "แก้ไขรายการไม่สำเร็จ หรือไม่พบรายการนี้ในบัญชีของคุณ", fieldErrors: {} };
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/transactions?saved=updated");
}

export async function deleteTransactionAction(formData: FormData) {
  const { supabase, userId } = await getSignedInUser();
  const id = readFormString(formData, "id");
  if (!zodUuid(id) || readFormString(formData, "confirm_delete") !== "yes") redirect("/dashboard/transactions?error=delete-confirmation");
  const { data, error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error || !data) redirect("/dashboard/transactions?error=delete-failed");
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/transactions?saved=deleted");
}

export async function createTaxRecordAction(_state: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { supabase, userId } = await getSignedInUser();
  const parsed = taxRecordSchema.safeParse(taxRecordData(formData));
  if (!parsed.success) return stateFromIssues(parsed.error.issues);
  if (parsed.data.transaction_id) {
    const { data, error } = await supabase.from("transactions").select("id").eq("id", parsed.data.transaction_id).eq("user_id", userId).maybeSingle();
    if (error || !data) return { error: "เลือกรายการจากบัญชีของคุณเท่านั้น", fieldErrors: { transaction_id: "ไม่พบรายการนี้ในบัญชีของคุณ" } };
  }
  const { error } = await supabase.from("tax_records").insert({ ...parsed.data, user_id: userId });
  if (error) return { error: "บันทึกรายการภาษีไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองอีกครั้ง", fieldErrors: {} };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tax");
  redirect(`/dashboard/tax?year=${parsed.data.tax_year}&saved=created`);
}

export async function updateTaxRecordAction(_state: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { supabase, userId } = await getSignedInUser();
  const id = readFormString(formData, "id");
  if (!zodUuid(id)) return { error: "ไม่พบรายการภาษีที่ต้องการแก้ไข", fieldErrors: {} };
  const parsed = taxRecordSchema.safeParse(taxRecordData(formData));
  if (!parsed.success) return stateFromIssues(parsed.error.issues);
  if (parsed.data.transaction_id) {
    const { data, error } = await supabase.from("transactions").select("id").eq("id", parsed.data.transaction_id).eq("user_id", userId).maybeSingle();
    if (error || !data) return { error: "เลือกรายการจากบัญชีของคุณเท่านั้น", fieldErrors: { transaction_id: "ไม่พบรายการนี้ในบัญชีของคุณ" } };
  }
  const { data, error } = await supabase.from("tax_records").update(parsed.data).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error || !data) return { error: "แก้ไขรายการภาษีไม่สำเร็จ หรือไม่พบรายการนี้ในบัญชีของคุณ", fieldErrors: {} };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tax");
  redirect(`/dashboard/tax?year=${parsed.data.tax_year}&saved=updated`);
}

export async function deleteTaxRecordAction(formData: FormData) {
  const { supabase, userId } = await getSignedInUser();
  const id = readFormString(formData, "id");
  if (!zodUuid(id) || readFormString(formData, "confirm_delete") !== "yes") redirect("/dashboard/tax?error=delete-confirmation");
  const { data, error } = await supabase.from("tax_records").delete().eq("id", id).eq("user_id", userId).select("tax_year").maybeSingle();
  if (error || !data) redirect("/dashboard/tax?error=delete-failed");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tax");
  redirect(`/dashboard/tax?year=${data.tax_year}&saved=deleted`);
}

const taxTransactionSearchSchema = z.object({
  date: z.iso.date().or(z.literal("")),
  description: z.string().trim().max(120),
});

export async function searchTaxTransactionsAction(filters: { date: string; description: string }) {
  const { supabase, userId } = await getSignedInUser();
  const parsed = taxTransactionSearchSchema.safeParse(filters);
  if (!parsed.success) return { error: "กรุณาตรวจวันที่และคำค้นหา" };

  const { date, description } = parsed.data;
  let query = supabase.from("transactions").select("id,transaction_date,description,amount_thb").eq("user_id", userId);
  if (date) query = query.eq("transaction_date", date);
  if (description) query = query.ilike("description", `%${description.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error } = await query.order("transaction_date", { ascending: false }).order("id").limit(51);
  if (error || !data) return { error: "ค้นหารายการไม่สำเร็จ กรุณาลองอีกครั้ง" };
  return { rows: data.slice(0, 50), hasMore: data.length > 50 };
}

export async function startDeleteAccountReauthAction() {
  if (!hasSupabaseEnv()) redirect("/dashboard/settings/delete?error=setup");
  if (!process.env.SUPABASE_SECRET_KEY) redirect("/dashboard/settings/delete?error=service-key");
  const { supabase, userId, claims } = await getSignedInUser();
  if (typeof claims.session_id !== "string") redirect("/dashboard/settings/delete?error=reauth");
  const proof = createDeletionProof("reauth", userId, claims.session_id);
  if (!proof) redirect("/dashboard/settings/delete?error=service-key");

  const cookieStore = await cookies();
  cookieStore.delete(deletionGrantCookie);
  cookieStore.set(deletionReauthCookie, proof, deletionCookieOptions);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", siteUrl).toString(), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) {
    cookieStore.delete(deletionReauthCookie);
    redirect("/dashboard/settings/delete?error=reauth");
  }
  redirect(data.url);
}

export async function deleteAccountAction(formData: FormData) {
  if (!process.env.SUPABASE_SECRET_KEY) redirect("/dashboard/settings/delete?error=service-key");

  const { supabase, userId, claims } = await getSignedInUser();
  const cookieStore = await cookies();
  if (!hasDeletionGrant(cookieStore.get(deletionGrantCookie)?.value, claims)) {
    redirect("/dashboard/settings/delete?error=reauth-required");
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || user?.id !== userId) redirect("/dashboard/settings/delete?error=reauth-required");
  if (!user.email || readFormString(formData, "confirm_email").toLowerCase() !== user.email.toLowerCase() || readFormString(formData, "confirm_delete") !== "yes") {
    redirect("/dashboard/settings/delete?error=confirmation");
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.deleteUser(userId, false);
  if (error) redirect("/dashboard/settings/delete?error=delete");

  for (const cookie of cookieStore.getAll()) {
    if (/^sb-.+-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(cookie.name)) cookieStore.delete(cookie.name);
  }
  cookieStore.delete("paoween_setup_complete");
  cookieStore.delete(deletionReauthCookie);
  cookieStore.delete(deletionGrantCookie);
  revalidatePath("/dashboard", "layout");
  redirect("/?account=deleted");
}

function zodUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

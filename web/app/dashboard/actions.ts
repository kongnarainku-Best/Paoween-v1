"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readFormString, stateFromIssues, type FinanceFormState } from "@/lib/finance/form-state";
import { getSignedInUser, hasRecentGoogleAuthentication } from "@/lib/finance/server";
import { taxRecordSchema, transactionSchema } from "@/lib/finance/validation";
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
  input: { transaction_date: string; transaction_type: string; description: string; amount_thb: number },
  exceptId?: string,
) {
  let query = supabase.from("transactions").select("id").eq("user_id", userId)
    .eq("transaction_date", input.transaction_date)
    .eq("transaction_type", input.transaction_type)
    .eq("description", input.description)
    .eq("amount_thb", input.amount_thb).limit(1);
  if (exceptId) query = query.neq("id", exceptId);
  return query.maybeSingle();
}

export async function createTransactionAction(_state: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { supabase, userId } = await getSignedInUser();
  const parsed = transactionSchema.safeParse(transactionData(formData));
  if (!parsed.success) return stateFromIssues(parsed.error.issues);

  const duplicate = await isDuplicateTransaction(supabase, userId, parsed.data);
  if (duplicate.error) return { error: "ตรวจรายการซ้ำไม่สำเร็จ กรุณาลองอีกครั้ง", fieldErrors: {} };
  if (duplicate.data && readFormString(formData, "allow_duplicate") !== "yes") {
    return { error: "พบรายการที่มีวัน ประเภท จำนวนเงิน และคำอธิบายตรงกัน กรุณาตรวจสอบก่อนบันทึกซ้ำ", fieldErrors: {}, duplicate: true };
  }

  const { error } = await supabase.from("transactions").insert({
    ...parsed.data,
    user_id: userId,
    source: "manual_entry",
  });
  if (error) return { error: "บันทึกรายการไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองอีกครั้ง", fieldErrors: {} };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
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
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  redirect("/dashboard/transactions?saved=updated");
}

export async function deleteTransactionAction(formData: FormData) {
  const { supabase, userId } = await getSignedInUser();
  const id = readFormString(formData, "id");
  if (!zodUuid(id) || readFormString(formData, "confirm_delete") !== "yes") redirect("/dashboard/transactions?error=delete-confirmation");
  const { data, error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error || !data) redirect("/dashboard/transactions?error=delete-failed");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
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
  redirect("/dashboard/tax?saved=created");
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
  redirect("/dashboard/tax?saved=updated");
}

export async function deleteTaxRecordAction(formData: FormData) {
  const { supabase, userId } = await getSignedInUser();
  const id = readFormString(formData, "id");
  if (!zodUuid(id) || readFormString(formData, "confirm_delete") !== "yes") redirect("/dashboard/tax?error=delete-confirmation");
  const { data, error } = await supabase.from("tax_records").delete().eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error || !data) redirect("/dashboard/tax?error=delete-failed");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tax");
  redirect("/dashboard/tax?saved=deleted");
}

export async function startDeleteAccountReauthAction() {
  if (!hasSupabaseEnv()) redirect("/dashboard/settings/delete?error=setup");
  const { supabase } = await getSignedInUser();
  const cookieStore = await cookies();
  cookieStore.set("paoween_delete_reauth", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", siteUrl).toString(), queryParams: { prompt: "login" } },
  });
  if (error || !data.url) {
    cookieStore.delete("paoween_delete_reauth");
    redirect("/dashboard/settings/delete?error=reauth");
  }
  redirect(data.url);
}

export async function deleteAccountAction(formData: FormData) {
  const { userId, claims } = await getSignedInUser();
  const email = typeof claims.email === "string" ? claims.email : "";
  if (!hasRecentGoogleAuthentication(claims as Record<string, unknown>)) {
    redirect("/dashboard/settings/delete?error=reauth-required");
  }
  if (!email || readFormString(formData, "confirm_email").toLowerCase() !== email.toLowerCase() || readFormString(formData, "confirm_delete") !== "yes") {
    redirect("/dashboard/settings/delete?error=confirmation");
  }
  if (!process.env.SUPABASE_SECRET_KEY) redirect("/dashboard/settings/delete?error=service-key");

  const service = createServiceClient();
  const { error } = await service.auth.admin.deleteUser(userId, false);
  if (error) redirect("/dashboard/settings/delete?error=delete");
  const cookieStore = await cookies();
  cookieStore.getAll().filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)).forEach((cookie) => cookieStore.delete(cookie.name));
  revalidatePath("/dashboard", "layout");
  redirect("/");
}

function zodUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

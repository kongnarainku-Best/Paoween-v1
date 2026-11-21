"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { stateFromIssues } from "@/lib/finance/form-state";
import { bangkokDate } from "@/lib/finance/pocket";
import { getSignedInUser } from "@/lib/finance/server";
import { isoDate } from "@/lib/finance/validation";

const pocketSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "ตั้งชื่อกระเป๋า").max(80, "ชื่อกระเป๋าต้องไม่เกิน 80 ตัวอักษร"),
  opening_balance_thb: z.string().trim().regex(/^-?\d{1,12}(?:\.\d{1,2})?$/, "ใส่จำนวนเงินที่มีทศนิยมไม่เกิน 2 ตำแหน่ง").transform(Number),
  opening_date: isoDate.refine((value) => value <= bangkokDate(), "วันที่เริ่มติดตามต้องเป็นวันนี้หรือก่อนหน้า"),
});

export async function createPocket(input: {
  id: string;
  name: string;
  opening_balance_thb: string;
  opening_date: string;
}): Promise<{ ok: true } | { ok: false; error: string; fieldErrors: Record<string, string> }> {
  const { supabase, userId } = await getSignedInUser();
  const parsed = pocketSchema.safeParse(input);
  if (!parsed.success) {
    const state = stateFromIssues(parsed.error.issues);
    return { ok: false, error: state.error ?? "ตรวจข้อมูลกระเป๋าอีกครั้ง", fieldErrors: state.fieldErrors };
  }

  const { error } = await supabase.from("pockets").insert({ ...parsed.data, user_id: userId });
  if (error?.code === "23505") {
    const { data } = await supabase.from("pockets").select("name,opening_balance_thb,opening_date")
      .eq("user_id", userId).eq("id", parsed.data.id).maybeSingle();
    if (data?.name === parsed.data.name && data.opening_date === parsed.data.opening_date
      && Number(data.opening_balance_thb) === parsed.data.opening_balance_thb) {
      revalidatePath("/dashboard", "layout");
      return { ok: true };
    }
  }
  if (error) return { ok: false, error: "สร้างกระเป๋าไม่สำเร็จ กรุณาลองอีกครั้ง", fieldErrors: {} };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { normalizeTransactionDescription } from "@/lib/finance/transaction-match";
import type { TransactionInput } from "@/lib/finance/validation";

export async function findAssistantDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  transaction: TransactionInput,
  exceptId?: string,
  includeUnassignedMatches = false,
) {
  const description = normalizeTransactionDescription(transaction.description);
  const query = supabase.from("transactions").select("id,description")
    .eq("user_id", userId)
    .eq("transaction_date", transaction.transaction_date)
    .eq("transaction_type", transaction.transaction_type)
    .eq("amount_thb", transaction.amount_thb)
    .order("id");
  for (const field of ["investment_direction", "pocket_id", "destination_pocket_id"] as const) {
    const value = transaction[field];
    if (includeUnassignedMatches) {
      if (value) query.or(`${field}.eq.${value},${field}.is.null`);
    } else if (value) query.eq(field, value);
    else query.is(field, null);
  }
  if (exceptId) query.neq("id", exceptId);

  const pageSize = 250;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) return { duplicate: false, error };
    if (data.some((row) => normalizeTransactionDescription(row.description) === description)) {
      return { duplicate: true, error: null };
    }
    if (data.length < pageSize) return { duplicate: false, error: null };
  }
}

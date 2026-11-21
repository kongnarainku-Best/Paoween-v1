type ComparableTransaction = {
  transaction_date: string;
  transaction_type: string;
  amount_thb: number | string;
  description: string;
  investment_direction?: string | null;
  pocket_id?: string | null;
  destination_pocket_id?: string | null;
};

export function normalizeTransactionDescription(value: string) {
  const text = value.normalize("NFKC").trim().toLowerCase();
  return text.replace(/[^\p{L}\p{N}\p{M}]+/gu, "") || text;
}

export function transactionMatchKey(transaction: ComparableTransaction) {
  return JSON.stringify([
    transaction.transaction_date,
    transaction.transaction_type,
    Number(transaction.amount_thb),
    normalizeTransactionDescription(transaction.description),
    transaction.transaction_type === "investment" ? transaction.investment_direction ?? null : null,
    transaction.pocket_id ?? null,
    transaction.transaction_type === "transfer" ? transaction.destination_pocket_id ?? null : null,
  ]);
}

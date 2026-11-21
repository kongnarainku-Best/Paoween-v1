import type { TaxRecordInput } from "./validation";

export type TaxContextRow = Pick<TaxRecordInput, "record_type" | "tax_category" | "document_status" | "review_status" | "tax_year"> & {
  amount_thb: number | string | null;
};

type TaxContextEntry = Omit<TaxContextRow, "record_type" | "tax_year" | "amount_thb"> & {
  amount_thb: number | null;
};

export const taxContextLimit = 20;
const detailTypes = ["income", "deduction", "tax_paid"] as const;

function detailSubtotals(rows: readonly TaxContextEntry[] | undefined) {
  const satang: Partial<Record<"confirmed" | "needs_review", number>> = {};
  for (const row of rows ?? []) {
    if (row.amount_thb === null || row.review_status === "rejected") continue;
    satang[row.review_status] = (satang[row.review_status] ?? 0) + Math.round(row.amount_thb * 100);
  }
  return Object.fromEntries(Object.entries(satang).map(([status, total]) => [status, total / 100]));
}

export function buildTaxContext(rows: ReadonlyArray<TaxContextRow>, selectedTaxYear: number | "all", totalCount: number | null) {
  const scopedRows = selectedTaxYear === "all" ? rows : rows.filter((row) => row.tax_year === selectedTaxYear);
  const byYear = new Map<number, Partial<Record<TaxContextRow["record_type"], TaxContextEntry[]>>>();
  for (const row of scopedRows.slice(0, taxContextLimit)) {
    const groups = byYear.get(row.tax_year) ?? {};
    const entries = groups[row.record_type] ?? [];
    entries.push({
      tax_category: row.tax_category,
      amount_thb: row.amount_thb === null ? null : Number(row.amount_thb),
      document_status: row.document_status,
      review_status: row.review_status,
    });
    groups[row.record_type] = entries;
    byYear.set(row.tax_year, groups);
  }

  return {
    selected_tax_year: selectedTaxYear,
    sample_limit: taxContextLimit,
    sample_is_complete: totalCount === scopedRows.length && scopedRows.length <= taxContextLimit,
    years: Array.from(byYear, ([tax_year, records_by_type]) => ({
      tax_year,
      records_by_type,
      detail_subtotals_thb: Object.fromEntries(detailTypes.map((type) => [type, detailSubtotals(records_by_type[type])])),
    })),
  };
}

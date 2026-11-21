// Zero is the database policy sentinel for no application output-token cap.
// Invalid reservations must never silently turn into an uncapped API request.
export function readOutputTokenLimit(reservation: unknown): number | null {
  if (!reservation || typeof reservation !== "object" || Array.isArray(reservation)) return null;
  const limit = (reservation as Record<string, unknown>).max_output_tokens;
  return typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 0 ? limit : null;
}

export function outputTokenOptions(limit: number): { max_output_tokens?: number } {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Invalid output-token limit");
  return limit === 0 ? {} : { max_output_tokens: limit };
}

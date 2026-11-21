export type FinanceFormState = {
  error: string | null;
  fieldErrors: Record<string, string>;
  duplicate?: boolean;
};

export const emptyFinanceFormState: FinanceFormState = { error: null, fieldErrors: {} };

export function stateFromIssues(issues: { path: PropertyKey[]; message: string }[], error = "กรุณาตรวจข้อมูลที่กรอก") {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { error, fieldErrors } satisfies FinanceFormState;
}

export function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

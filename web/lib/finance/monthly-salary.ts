export const monthlySalaryInputError = "ใส่เงินเดือนสุทธิมากกว่า 0 ถึง 10,000,000 บาท และใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง";
export const monthlySalaryStorageError = "เบราว์เซอร์บันทึกเงินเดือนไม่ได้ กรุณาตรวจการตั้งค่าพื้นที่จัดเก็บแล้วลองอีกครั้ง";

export function parseMonthlySalary(input: string): number | null {
  const text = input.trim();
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) return null;
  const amount = Number(text.replaceAll(",", ""));
  return amount > 0 && amount <= 10_000_000 ? amount : null;
}

export function monthlySalaryStorageKey(userId: string) {
  return `paoween:monthly-net-salary:${userId}`;
}

export function readMonthlySalary(userId: string) {
  return parseMonthlySalary(window.localStorage.getItem(monthlySalaryStorageKey(userId)) ?? "");
}

export function setMonthlySalary(userId: string, amount: number | null) {
  const key = monthlySalaryStorageKey(userId);
  if (amount === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, String(amount));
}

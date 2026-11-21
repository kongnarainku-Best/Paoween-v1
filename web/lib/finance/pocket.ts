export type PocketOption = { id: string; name: string };

export function pocketLabel(type: string, direction?: string | null) {
  if (type === "transfer") return "กระเป๋าต้นทาง";
  if (type === "income" || direction === "sell") return "เงินเข้ากระเป๋า";
  if (type === "investment" && !direction) return "กระเป๋า";
  return "จ่ายจากกระเป๋า";
}

export function bangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export type PocketOption = { id: string; name: string };

function pocketKey(name: string) {
  return name.normalize("NFKC").toLowerCase().trim()
    .replace(/^(?:กระเป๋า|ธนาคาร|บัญชี)\s*/u, "").replace(/[\s._-]+/gu, "");
}

function uniquePocket(pockets: readonly PocketOption[], hint?: string | null) {
  const name = hint?.trim();
  const key = name && pocketKey(name);
  const isScb = (value: string) => /(?:^|[^a-z])scb(?:$|[^a-z])|ไทยพาณิชย์|siam\s*commercial\s*bank/iu.test(value);
  if (key) {
    const exact = pockets.filter((pocket) => pocketKey(pocket.name) === key);
    if (exact.length) return exact.length === 1 ? exact[0].id : null;
    if (!isScb(name)) return null;
  }
  const scb = pockets.filter((pocket) => isScb(pocket.name));
  return scb.length === 1 ? scb[0].id : null;
}

export function assistantDraftPockets(pockets: readonly PocketOption[], type: string, primary?: string | null, destination?: string | null) {
  let pocket_id = uniquePocket(pockets, primary);
  let destination_pocket_id = type === "transfer" && (destination || (primary && pocket_id))
    ? uniquePocket(pockets, destination) : null;
  if (pocket_id && pocket_id === destination_pocket_id) {
    if (destination && !primary) pocket_id = null;
    else destination_pocket_id = null;
  }
  return { pocket_id, destination_pocket_id };
}

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

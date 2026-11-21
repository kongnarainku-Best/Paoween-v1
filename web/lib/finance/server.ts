import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const getSignedInUser = cache(async function getSignedInUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;
  if (error || !claims || typeof userId !== "string") redirect("/");
  return { supabase, userId, claims };
});

export function hasRecentGoogleAuthentication(claims: Record<string, unknown>, maxAgeSeconds = 300) {
  const methods = claims.amr;
  if (!Array.isArray(methods)) return false;
  const now = Math.floor(Date.now() / 1000);
  const latest = methods.reduce<number>((mostRecent, item) => {
    if (!item || typeof item !== "object") return mostRecent;
    const method = (item as Record<string, unknown>).method;
    const timestamp = (item as Record<string, unknown>).timestamp;
    if (method !== "oauth" || typeof timestamp !== "number") return mostRecent;
    return Math.max(mostRecent, timestamp);
  }, 0);
  return latest > 0 && latest <= now + 30 && now - latest <= maxAgeSeconds;
}

export function getBangkokMonthRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    year,
    month,
  };
}

export function getBangkokMonthRangeForKey(key?: string, now = new Date()) {
  const fallback = getBangkokMonthRange(now);
  const match = key?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const year = match ? Number(match[1]) : fallback.year;
  const month = match ? Number(match[2]) : fallback.month;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    year,
    month,
  };
}

export function getRecentBangkokMonths(count = 7, now = new Date()) {
  const current = getBangkokMonthRange(now);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(current.year, current.month - 1 - (count - index - 1), 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const start = `${key}-01`;
    const next = new Date(Date.UTC(year, month, 1));
    return {
      key,
      start,
      end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`,
      label: new Intl.DateTimeFormat("th-TH", { month: "short", timeZone: "Asia/Bangkok" }).format(new Date(`${key}-01T00:00:00.000Z`)),
    };
  });
}

export function currentThaiTaxYear(now = new Date()) {
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric" }).format(now));
  return year + 543;
}

export function formatTHB(amount: number | string | null) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(amount));
}

export function formatThaiDate(isoDate: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

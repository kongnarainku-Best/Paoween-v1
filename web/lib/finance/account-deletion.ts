import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const deletionReauthCookie = "paoween_delete_reauth";
export const deletionGrantCookie = "paoween_delete_grant";

const maxAge = 300;
export const deletionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge,
} as const;

type DeletionProof = {
  purpose: "reauth" | "delete";
  userId: string;
  sessionId: string;
  expiresAt: number;
};

function sign(payload: string) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  return secret ? createHmac("sha256", secret).update("paoween-account-deletion:").update(payload).digest() : null;
}

export function createDeletionProof(purpose: DeletionProof["purpose"], userId: string, sessionId: string) {
  const payload = Buffer.from(JSON.stringify({ purpose, userId, sessionId, expiresAt: Date.now() + maxAge * 1000 })).toString("base64url");
  const signature = sign(payload);
  return signature ? `${payload}.${signature.toString("base64url")}` : null;
}

export function readDeletionProof(value: string | undefined, purpose: DeletionProof["purpose"]): DeletionProof | null {
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = sign(payload);
  const actual = Buffer.from(signature, "base64url");
  if (!expected || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const proof = JSON.parse(Buffer.from(payload, "base64url").toString()) as DeletionProof;
    if (proof.purpose !== purpose || typeof proof.userId !== "string" || typeof proof.sessionId !== "string" ||
        typeof proof.expiresAt !== "number" || proof.expiresAt <= Date.now()) return null;
    return proof;
  } catch {
    return null;
  }
}

export function hasDeletionGrant(value: string | undefined, claims: { sub?: unknown; session_id?: unknown }) {
  const proof = readDeletionProof(value, "delete");
  return Boolean(proof && proof.userId === claims.sub && proof.sessionId === claims.session_id);
}

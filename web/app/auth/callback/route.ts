import { NextResponse, type NextRequest } from "next/server";

import { createDeletionProof, deletionCookieOptions, deletionGrantCookie, deletionReauthCookie, readDeletionProof } from "@/lib/finance/account-deletion";
import { hasRecentGoogleAuthentication } from "@/lib/finance/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL("/?error=setup", request.url));
  }

  const pending = request.cookies.get(deletionReauthCookie)?.value;
  const code = request.nextUrl.searchParams.get("code");
  const redirectAfterAuth = (path: string, grant?: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.delete(deletionReauthCookie);
    if (grant) response.cookies.set(deletionGrantCookie, grant, deletionCookieOptions);
    else response.cookies.delete(deletionGrantCookie);
    return response;
  };

  if (!code) return redirectAfterAuth(pending ? "/dashboard/settings/delete?error=reauth" : "/?error=oauth");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirectAfterAuth(pending ? "/dashboard/settings/delete?error=reauth" : "/?error=oauth");
  if (!pending) return redirectAfterAuth("/dashboard");

  const proof = readDeletionProof(pending, "reauth");
  const { data: verified } = await supabase.auth.getClaims();
  const claims = verified?.claims;
  const sessionId = claims?.session_id;
  if (proof && (data.user?.id !== proof.userId || claims?.sub !== proof.userId)) {
    return redirectAfterAuth("/dashboard/settings/delete?error=account-mismatch");
  }
  if (!proof || !claims || typeof sessionId !== "string" || sessionId === proof.sessionId || !hasRecentGoogleAuthentication(claims)) {
    return redirectAfterAuth("/dashboard/settings/delete?error=reauth-required");
  }

  const grant = createDeletionProof("delete", proof.userId, sessionId);
  return grant
    ? redirectAfterAuth("/dashboard/settings/delete", grant)
    : redirectAfterAuth("/dashboard/settings/delete?error=service-key");
}

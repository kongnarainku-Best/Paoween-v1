import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL("/?error=setup", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const response = NextResponse.redirect(new URL("/?error=oauth", request.url));
    response.cookies.delete("paoween_delete_reauth");
    return response;
  }

  const isDeleteReauth = request.cookies.get("paoween_delete_reauth")?.value === "1";
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const response = NextResponse.redirect(new URL("/?error=oauth", request.url));
    response.cookies.delete("paoween_delete_reauth");
    return response;
  }

  const destination = isDeleteReauth ? "/dashboard/settings/delete?reauthenticated=1" : "/dashboard";
  const response = NextResponse.redirect(new URL(destination, request.url));
  if (isDeleteReauth) response.cookies.delete("paoween_delete_reauth");
  return response;
}

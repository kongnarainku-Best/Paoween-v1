import { NextResponse } from "next/server";

import { getAiReadiness } from "@/lib/finance/ai-readiness";
import { getSignedInUser } from "@/lib/finance/server";

export const dynamic = "force-dynamic";

export async function GET() {
  await getSignedInUser();
  const readiness = await getAiReadiness();
  return NextResponse.json({ ready: readiness.ready }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

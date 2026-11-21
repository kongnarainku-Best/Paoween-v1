import "server-only";

import type { getSignedInUser } from "./server";
import type { PocketOption } from "./pocket";

type Client = Awaited<ReturnType<typeof getSignedInUser>>["supabase"];

export async function listPocketOptions(supabase: Client, userId: string): Promise<PocketOption[]> {
  const options: PocketOption[] = [];
  const size = 500;
  for (let start = 0; ; start += size) {
    const { data, error } = await supabase.from("pockets").select("id,name")
      .eq("user_id", userId).order("created_at").order("id").range(start, start + size - 1);
    if (error) throw new Error("Could not load pockets");
    options.push(...data);
    if (data.length < size) return options;
  }
}

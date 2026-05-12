import { headers } from "next/headers";
import type { PlatformServiceContext } from "@bloqer/services";

export async function getPlatformServiceContext(actorUserId: string): Promise<PlatformServiceContext> {
  const h = await headers();
  return {
    actorUserId,
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}

"use client";

import { toast } from "sonner";

type ActionResult = { error: string } | { ok: true } | { id: string } | Record<string, unknown>;

export async function runActionWithToast(
  action: () => Promise<ActionResult>,
  messages: { success: string; errorFallback?: string },
): Promise<ActionResult> {
  const result = await action();
  if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
    toast.error(result.error);
    return result;
  }
  toast.success(messages.success);
  return result;
}

import type { z } from "zod";
import { ServiceError } from "../types";

export function parseApInput<T>(schema: z.ZodType<T, unknown>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  return parsed.data;
}

export function requireApCancellationReason(status: string, reason?: string): string | undefined {
  const normalized = reason?.trim();
  if ((status === "ISSUED" || status === "CONFIRMED") && !normalized) {
    throw new ServiceError("VALIDATION", "Ingresá el motivo de la anulación");
  }
  return normalized || undefined;
}

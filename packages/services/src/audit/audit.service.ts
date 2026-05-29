import { prisma } from "@bloqer/database";
import type { AuditLog, Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertAuditContextScope } from "./audit-context";
import { sanitizeAuditPayload } from "./audit-sanitize";
import type { LogAuditInput } from "./audit-types";

export type { LogAuditInput } from "./audit-types";

const ACTION_MAX = 128;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function buildAuditLogData(input: LogAuditInput): Prisma.AuditLogUncheckedCreateInput {
  const action = truncate(input.action.trim(), ACTION_MAX);
  if (!action) {
    throw new ServiceError("VALIDATION", "La acción de auditoría es obligatoria");
  }
  if (!input.entityType.trim() || !input.entityId.trim()) {
    throw new ServiceError("VALIDATION", "entityType y entityId son obligatorios");
  }

  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    action,
    entityType: input.entityType.trim(),
    entityId: input.entityId.trim(),
    projectId: input.projectId ?? null,
    companyId: input.companyId ?? null,
    before: sanitizeAuditPayload(input.before),
    after: sanitizeAuditPayload(input.after),
    ipAddress: input.ipAddress ?? null,
  };
}

export async function log(
  input: LogAuditInput,
  tx?: Prisma.TransactionClient,
): Promise<AuditLog> {
  const db = tx ?? prisma;
  await assertAuditContextScope(input, db);
  return db.auditLog.create({ data: buildAuditLogData(input) });
}

/** Cron / system mutations with no human actor. */
export async function logSystemAction(
  input: Omit<LogAuditInput, "actorUserId">,
  tx?: Prisma.TransactionClient,
): Promise<AuditLog> {
  return log({ ...input, actorUserId: null }, tx);
}

export async function listEntityAuditLogs(
  tenantId: string,
  entityType: string,
  entityId: string,
  actions?: string[],
) {
  return prisma.auditLog.findMany({
    where: {
      tenantId,
      entityType,
      entityId,
      ...(actions?.length ? { action: { in: actions } } : {}),
    },
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export { sanitizeAuditPayload } from "./audit-sanitize";

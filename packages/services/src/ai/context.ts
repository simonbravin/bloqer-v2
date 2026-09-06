import { randomUUID } from "node:crypto";
import type { ServiceContext } from "../types";
import type { AiExecutionContext } from "./types";
import { PRODUCT_TIMEZONE } from "@bloqer/utils";
import { USER_ROLE_LABEL_ES, type UserRole } from "@bloqer/domain";
import { preferredFirstName } from "./policy/access";
import { requireProjectAccess } from "../security/access";

export type BuildAiExecutionContextInput = {
  service: ServiceContext;
  correlationId?: string;
  currentRoute?: string;
  currentProjectId?: string;
  currentEntityType?: string;
  currentEntityId?: string;
  actorDisplayName?: string;
  tenantName?: string;
  enabledModules?: AiExecutionContext["enabledModules"];
  timezone?: string;
  isFirstAssistantTurn?: boolean;
};

/**
 * Builds AI context from authenticated session fields only.
 * Never trust model-supplied tenantId/userId/roles/permissions.
 */
export function buildAiExecutionContext(input: BuildAiExecutionContextInput): AiExecutionContext {
  const displayName = input.actorDisplayName;
  return {
    service: input.service,
    correlationId: input.correlationId ?? randomUUID(),
    locale: "es-AR",
    timezone: input.timezone ?? PRODUCT_TIMEZONE,
    currentRoute: input.currentRoute,
    currentProjectId: input.currentProjectId,
    currentEntityType: input.currentEntityType,
    currentEntityId: input.currentEntityId,
    actorDisplayName: displayName,
    actorPreferredName: preferredFirstName(displayName),
    actorRoleLabels: input.service.roles.map(
      (r) => USER_ROLE_LABEL_ES[r as UserRole] ?? r,
    ),
    tenantName: input.tenantName,
    enabledModules: input.enabledModules,
    isFirstAssistantTurn: input.isFirstAssistantTurn,
  };
}

/**
 * Resolves project id for tools: explicit arg wins, else validated UI hint.
 * Conversation history is NOT authorization — always revalidate tenant + project ACL.
 */
export async function resolveAiProjectId(
  ctx: AiExecutionContext,
  explicitProjectId?: string | null,
): Promise<string | null> {
  const candidate = explicitProjectId?.trim() || ctx.currentProjectId?.trim() || null;
  if (!candidate) return null;
  await requireProjectAccess(candidate, ctx.service);
  return candidate;
}

import { randomUUID } from "node:crypto";
import type { ServiceContext } from "../types";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import type { AiExecutionContext } from "./types";
import { PRODUCT_TIMEZONE } from "@bloqer/utils";

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
};

/**
 * Builds AI context from authenticated session fields only.
 * Never trust model-supplied tenantId/userId.
 */
export function buildAiExecutionContext(input: BuildAiExecutionContextInput): AiExecutionContext {
  return {
    service: input.service,
    correlationId: input.correlationId ?? randomUUID(),
    locale: "es-AR",
    timezone: input.timezone ?? PRODUCT_TIMEZONE,
    currentRoute: input.currentRoute,
    currentProjectId: input.currentProjectId,
    currentEntityType: input.currentEntityType,
    currentEntityId: input.currentEntityId,
    actorDisplayName: input.actorDisplayName,
    tenantName: input.tenantName,
    enabledModules: input.enabledModules,
  };
}

/**
 * Resolves project id for tools: explicit arg wins, else validated UI hint.
 */
export async function resolveAiProjectId(
  ctx: AiExecutionContext,
  explicitProjectId?: string | null,
): Promise<string | null> {
  const candidate = explicitProjectId?.trim() || ctx.currentProjectId?.trim() || null;
  if (!candidate) return null;
  await requireProjectInTenant(candidate, ctx.service.tenantId);
  return candidate;
}

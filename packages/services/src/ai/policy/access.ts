import { can } from "@bloqer/domain";
import type { PermissionModule } from "@bloqer/domain";
import type { ServiceContext } from "../../types";
import { canViewCompanyAp, canViewApProjectArea } from "../../ap/ap-access";
import { canViewCompanyAr, canViewArProjectArea } from "../../ar/ar-access";
import { canViewTreasury, canViewProjectFinancialsCapability } from "../../security/access";
import { canViewProcurementProjectArea, canViewPurchaseRequests } from "../../procurement/procurement-access";
import { canViewScheduleArea } from "../../schedule/schedule-access";
import { canViewProjectCostControlReport } from "../../project/project-nav-guards";
import { canViewJobsiteLogArea } from "../../jobsite-log/jobsite-log-access";
import type { AiExecutionContext } from "../types";
import type { AiDataClass, AiToolScope } from "./data-class";

/**
 * Safe user-facing denies — never name permission IDs, RBAC internals, or hidden resources.
 */
export const AI_DENY_MESSAGES = {
  TREASURY: "No tenés acceso a la información de tesorería de la empresa.",
  COMPANY_AP: "No tenés acceso a las cuentas por pagar de la empresa.",
  COMPANY_AR: "No tenés acceso a las cuentas por cobrar de la empresa.",
  COMPANY_OVERVIEW:
    "No tenés acceso suficiente para generar un resumen general de la empresa. Puedo analizar los proyectos a los que tenés acceso.",
  TOOL: "No tenés acceso a esa información con tu usuario actual.",
  MODULE: "Ese módulo no está disponible en esta empresa.",
  UNKNOWN_TOOL: "Herramienta no disponible.",
} as const;

export type AiToolAccessKind =
  | "session"
  | "help"
  | "projects"
  | "schedule"
  | "materials"
  | "jobsite"
  | "certifications"
  | "project_financial"
  | "project_or_company_ap"
  | "project_or_company_ar"
  | "treasury"
  | "purchase_requests"
  | "purchase_orders"
  | "field";

/** AI advertise can be stricter than UI service helpers (defense in depth). */
export function aiCanViewProjects(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "PROJECTS");
}

export function aiCanViewProcurement(roles: ServiceContext["roles"]): boolean {
  return canViewPurchaseRequests(roles);
}

export function aiCanViewProjectAp(roles: ServiceContext["roles"]): boolean {
  return canViewApProjectArea(roles);
}

export function aiCanViewProjectAr(roles: ServiceContext["roles"]): boolean {
  return canViewArProjectArea(roles);
}

export function aiCanViewCompanyAp(roles: ServiceContext["roles"]): boolean {
  return canViewCompanyAp(roles);
}

export function aiCanViewCompanyAr(roles: ServiceContext["roles"]): boolean {
  return canViewCompanyAr(roles);
}

/**
 * AI treasury — same authority as product (`canViewTreasury` / VIEW TREASURY).
 * VIEWER preset no longer includes TREASURY (D-111).
 */
export function aiCanViewTreasury(roles: ServiceContext["roles"]): boolean {
  return canViewTreasury(roles);
}

export function aiCanViewFieldSummary(roles: ServiceContext["roles"]): boolean {
  return (
    can(roles, "VIEW", "JOBSITE_LOG") ||
    can(roles, "VIEW", "PROJECTS") ||
    can(roles, "VIEW", "RFIS")
  );
}

export function isAiModuleEnabled(
  ctx: AiExecutionContext,
  module: PermissionModule,
): boolean {
  if (!ctx.enabledModules) return true;
  return ctx.enabledModules.includes(module);
}

export function evaluateAiToolAccess(
  kind: AiToolAccessKind,
  ctx: AiExecutionContext,
  requiredModules?: PermissionModule[],
): { allowed: boolean; denyMessage: string } {
  if (requiredModules?.length) {
    for (const mod of requiredModules) {
      if (!isAiModuleEnabled(ctx, mod)) {
        return { allowed: false, denyMessage: AI_DENY_MESSAGES.MODULE };
      }
    }
  }

  const roles = ctx.service.roles;

  switch (kind) {
    case "session":
    case "help":
      return { allowed: true, denyMessage: AI_DENY_MESSAGES.TOOL };
    case "projects":
      return aiCanViewProjects(roles)
        ? { allowed: true, denyMessage: AI_DENY_MESSAGES.TOOL }
        : { allowed: false, denyMessage: AI_DENY_MESSAGES.TOOL };
    case "schedule":
      return { allowed: canViewScheduleArea(roles), denyMessage: AI_DENY_MESSAGES.TOOL };
    case "materials":
      return { allowed: canViewProjectCostControlReport(roles), denyMessage: AI_DENY_MESSAGES.TOOL };
    case "jobsite":
      return { allowed: canViewJobsiteLogArea(roles), denyMessage: AI_DENY_MESSAGES.TOOL };
    case "certifications":
      return {
        allowed: can(roles, "VIEW", "CERTIFICATIONS") && canViewProjectFinancialsCapability(roles),
        denyMessage: AI_DENY_MESSAGES.TOOL,
      };
    case "project_financial":
      // Align with G4 capability — not VIEW PROJECTS alone.
      return canViewProjectFinancialsCapability(roles)
        ? { allowed: true, denyMessage: AI_DENY_MESSAGES.TOOL }
        : { allowed: false, denyMessage: AI_DENY_MESSAGES.TOOL };
    case "project_or_company_ap":
      return aiCanViewProjectAp(roles) || aiCanViewCompanyAp(roles)
        ? { allowed: true, denyMessage: AI_DENY_MESSAGES.COMPANY_AP }
        : { allowed: false, denyMessage: AI_DENY_MESSAGES.COMPANY_AP };
    case "project_or_company_ar":
      return aiCanViewProjectAr(roles) || aiCanViewCompanyAr(roles)
        ? { allowed: true, denyMessage: AI_DENY_MESSAGES.COMPANY_AR }
        : { allowed: false, denyMessage: AI_DENY_MESSAGES.COMPANY_AR };
    case "treasury":
      return aiCanViewTreasury(roles)
        ? { allowed: true, denyMessage: AI_DENY_MESSAGES.TREASURY }
        : { allowed: false, denyMessage: AI_DENY_MESSAGES.TREASURY };
    case "purchase_requests":
      return { allowed: canViewPurchaseRequests(roles), denyMessage: AI_DENY_MESSAGES.TOOL };
    case "purchase_orders":
      return { allowed: canViewProcurementProjectArea(roles), denyMessage: AI_DENY_MESSAGES.TOOL };
    case "field":
      return aiCanViewFieldSummary(roles)
        ? { allowed: true, denyMessage: AI_DENY_MESSAGES.TOOL }
        : { allowed: false, denyMessage: AI_DENY_MESSAGES.TOOL };
    default:
      return { allowed: false, denyMessage: AI_DENY_MESSAGES.TOOL };
  }
}

export type AiToolPolicy = {
  dataClass: AiDataClass;
  scope: AiToolScope;
  accessKind: AiToolAccessKind;
  /**
   * When false, tool is never advertised or executed via AI even if RBAC would allow
   * (AI access ≤ UI access; can be stricter).
   */
  aiAllowed?: boolean;
};

export function preferredFirstName(
  displayName: string | null | undefined,
): string | null {
  if (!displayName?.trim()) return null;
  const trimmed = displayName.trim();
  // Prefer not to greet with a raw email local-part.
  if (trimmed.includes("@")) return null;
  const first = trimmed.split(/\s+/)[0] ?? "";
  if (first.length < 2 || first.length > 40) return null;
  if (!/^[\p{L}][\p{L}'’.-]*$/u.test(first)) return null;
  return first;
}

export type AiAuthDecisionLog = {
  type: "bloqer_ai_tool_auth";
  correlationId: string;
  tenantId: string;
  userId: string;
  tool: string;
  decision: "allow" | "deny";
  phase: "advertise" | "execute";
  dataClass?: AiDataClass;
  scope?: AiToolScope;
  reason?: string;
};

/** Structured auth provenance — no payloads / balances / PII beyond ids already in session. */
export function logAiToolAuthDecision(entry: AiAuthDecisionLog): void {
  try {
    console.info(JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

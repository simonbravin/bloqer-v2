import { BloqerAiToolRegistry } from "./registry";
import { getCurrentContextTool } from "./tools/get-current-context";
import { searchProjectsTool } from "./tools/search-projects";
import { getProjectSummaryTool } from "./tools/get-project-summary";
import {
  getDelayedScheduleItemsTool,
  getProjectScheduleSummaryTool,
} from "./tools/schedule-tools";
import { getProjectMaterialShortagesTool } from "./tools/materials-tools";
import {
  getPendingPurchaseOrdersTool,
  getPurchaseOrderTool,
  searchPurchaseOrdersTool,
  searchPurchaseRequestsTool,
} from "./tools/procurement-tools";
import {
  getCashPositionTool,
  getPayablesTool,
  getReceivablesTool,
} from "./tools/finance-tools";
import {
  getProjectCertificationSummaryTool,
  getProjectFieldSummaryTool,
  getRecentJobsiteLogsTool,
} from "./tools/field-cert-tools";
import { createSearchBloqerKnowledgeTool, type KnowledgeToolDeps } from "./tools/knowledge-tool";

export type CreateDefaultBloqerAiRegistryOptions = KnowledgeToolDeps;

/** READ-only MVP registry. WRITE_CONFIRM tools must not be registered here. */
export function createDefaultBloqerAiToolRegistry(
  opts: CreateDefaultBloqerAiRegistryOptions = {},
): BloqerAiToolRegistry {
  const registry = new BloqerAiToolRegistry();
  const tools = [
    getCurrentContextTool,
    searchProjectsTool,
    getProjectSummaryTool,
    getProjectScheduleSummaryTool,
    getDelayedScheduleItemsTool,
    getProjectMaterialShortagesTool,
    searchPurchaseRequestsTool,
    searchPurchaseOrdersTool,
    getPurchaseOrderTool,
    getPendingPurchaseOrdersTool,
    getRecentJobsiteLogsTool,
    getProjectFieldSummaryTool,
    getPayablesTool,
    getReceivablesTool,
    getCashPositionTool,
    getProjectCertificationSummaryTool,
    createSearchBloqerKnowledgeTool(opts),
  ];
  for (const t of tools) registry.register(t);
  return registry;
}

import { z } from "zod";
import { getProjectMaterialsBoard } from "../../materials/project-materials-board.service";
import { resolveAiProjectId } from "../context";
import { defineBloqerAiTool, nowIso } from "../types";
import { ServiceError } from "../../types";

const inputSchema = z.object({
  projectId: z.string().uuid().optional(),
  window: z.enum(["this_week", "next_14_days", "month", "all"]).optional(),
  search: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const getProjectMaterialShortagesTool = defineBloqerAiTool({
  name: "get_project_material_shortages",
  description:
    "Materiales con faltante (need − ordered) del Materials Board. No inventa stock de depósito.",
  risk: "READ",
  requiredModules: ["PROJECTS", "BUDGETS"],
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      window: { type: "string", enum: ["this_week", "next_14_days", "month", "all"] },
      search: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 30 },
    },
    additionalProperties: false,
  },
  statusLabel: "Consultando materiales…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra.");
    const limit = args.limit ?? 20;
    const board = await getProjectMaterialsBoard(
      projectId,
      { window: args.window ?? "all", search: args.search },
      ctx.service,
    );
    const href = `/proyectos/${projectId}/materiales`;
    if (board.type !== "REPORT") {
      return {
        data: { type: board.type, shortages: [] },
        provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
        ui: { links: [{ label: "Ver materiales", href }] },
      };
    }
    const shortages = board.rows
      .filter((r) => Number(r.shortfallQty) > 0)
      .slice(0, limit)
      .map((r) => ({
        description: r.description,
        unit: r.unit,
        wbsCode: r.wbsCode,
        needQty: r.needQty,
        orderedQty: r.orderedQty,
        shortfallQty: r.shortfallQty,
        pendingReceiptQty: r.pendingReceiptQty,
      }));
    return {
      data: {
        budgetName: board.budgetName,
        currency: board.currency,
        shortfallRows: board.totals.shortfallRows,
        shortages,
      },
      provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
      truncation: { total: board.totals.shortfallRows, returned: shortages.length },
      ui: {
        summaryLabel: "Consultando materiales…",
        links: [{ label: "Ver materiales", href }],
      },
    };
  },
});

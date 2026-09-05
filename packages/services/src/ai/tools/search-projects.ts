import { z } from "zod";
import { listProjects } from "../../project/project.service";
import { defineBloqerAiTool, nowIso } from "../types";

const inputSchema = z.object({
  search: z.string().min(1).max(120).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  pageSize: z.number().int().min(1).max(20).optional(),
});

export const searchProjectsTool = defineBloqerAiTool({
  name: "search_projects",
  description: "Busca proyectos del tenant por nombre, código o ciudad.",
  risk: "READ",
  requiredModules: ["PROJECTS"],
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Texto libre (nombre/código/ciudad)" },
      status: { type: "string", enum: ["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] },
      pageSize: { type: "integer", minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
  },
  statusLabel: "Buscando proyectos…",
  async execute(ctx, args) {
    const pageSize = args.pageSize ?? 10;
    const { data, total } = await listProjects(
      { search: args.search, status: args.status, page: 1, pageSize },
      ctx.service,
    );
    return {
      data: {
        total,
        projects: data.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          status: p.status,
          clientName: p.client.fantasyName ?? p.client.legalName,
          href: `/proyectos/${p.id}`,
        })),
      },
      provenance: { sourceType: "bloqer_data", asOf: nowIso(), route: "/proyectos" },
      truncation: { total, returned: data.length },
      ui: {
        summaryLabel: "Buscando proyectos…",
        links: [{ label: "Ver proyectos", href: "/proyectos" }],
      },
    };
  },
});

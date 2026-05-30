import { prisma } from "@bloqer/database";
import {
  formatAuditActorLabel,
  getProjectShellInfo,
  type ServiceContext,
} from "@bloqer/services";
import type { PdfReportBranding, ResolvePdfBrandingOptions } from "./pdf-branding.types";

export async function resolvePdfReportBranding(
  ctx: ServiceContext,
  options: ResolvePdfBrandingOptions = {},
): Promise<PdfReportBranding> {
  const generatedAtIso = new Date().toISOString();

  const [tenantRow, userRow, scopedCompany] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id: ctx.tenantId },
      select: {
        name: true,
        companies: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { name: true, legalName: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: ctx.actorUserId },
      select: { name: true, email: true },
    }),
    ctx.companyId
      ? prisma.company.findFirst({
          where: { id: ctx.companyId, tenantId: ctx.tenantId, status: "ACTIVE" },
          select: { name: true, legalName: true },
        })
      : Promise.resolve(null),
  ]);

  let projectLabel: string | null = null;
  if (options.projectId) {
    const shell = await getProjectShellInfo(options.projectId, ctx);
    projectLabel = `${shell.code} · ${shell.name}`;
  }

  const primaryCompany = scopedCompany ?? tenantRow?.companies[0];
  const companyDisplayName = primaryCompany
    ? primaryCompany.legalName?.trim() || primaryCompany.name
    : null;

  return {
    tenantName: tenantRow?.name ?? "Organización",
    companyDisplayName,
    projectLabel,
    generatedByLabel: formatAuditActorLabel(
      ctx.actorUserId,
      userRow?.name ?? null,
      userRow?.email ?? null,
    ),
    generatedAtIso,
  };
}

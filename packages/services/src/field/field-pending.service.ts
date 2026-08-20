import { prisma } from "@bloqer/database";
import { isUuid } from "@bloqer/utils";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { resolveUserDisplayNames } from "../user/resolve-user-display-names";
import type { ServiceContext } from "../types";
import {
  FIELD_PENDING_GROUP_BY_SOURCE,
  fieldPendingSourcesForActor,
  type FieldPendingGroup,
  type FieldPendingSource,
} from "./field-pending-access";

const INBOX_LIMIT = 80;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

export type FieldPendingItem = {
  entityType: FieldPendingSource;
  entityId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  group: FieldPendingGroup;
  typeLabel: string;
  title: string;
  description: string | null;
  statusLabel: string;
  amount: string | null;
  currency: string | null;
  requestedByName: string | null;
  occurredAt: Date;
  href: string;
  priority: "normal" | "stale";
};

export type FieldPendingCounts = {
  total: number;
  purchaseOrders: number;
  jobsiteLogs: number;
  certifications: number;
  subcontractCertifications: number;
};

export type FieldPendingList = {
  items: FieldPendingItem[];
  counts: FieldPendingCounts;
  queryMs: number;
};

export type FieldPendingFilters = {
  projectId?: string;
  group?: FieldPendingGroup;
};

function stalePriority(occurredAt: Date): "normal" | "stale" {
  return Date.now() - occurredAt.getTime() >= STALE_MS ? "stale" : "normal";
}

function emptyCounts(): FieldPendingCounts {
  return {
    total: 0,
    purchaseOrders: 0,
    jobsiteLogs: 0,
    certifications: 0,
    subcontractCertifications: 0,
  };
}

export async function getMyFieldPendingCounts(
  ctx: ServiceContext,
  filters?: { projectId?: string },
): Promise<FieldPendingCounts> {
  const list = await getMyFieldPendingItems(ctx, { ...filters, countsOnly: true });
  return list.counts;
}

export async function getMyFieldPendingItems(
  ctx: ServiceContext,
  filters?: FieldPendingFilters & { countsOnly?: boolean },
): Promise<FieldPendingList> {
  const started = Date.now();
  const gate = await getTenantModuleGate(ctx);
  const sources = fieldPendingSourcesForActor(ctx.roles, gate);
  const projectFilter =
    filters?.projectId && isUuid(filters.projectId) ? filters.projectId : undefined;
  const groupFilter = filters?.group;
  const countsOnly = filters?.countsOnly === true;

  const activeSources = groupFilter
    ? sources.filter((s) => FIELD_PENDING_GROUP_BY_SOURCE[s] === groupFilter)
    : sources;

  const projectWhere = projectFilter ? { projectId: projectFilter } : {};
  const counts = emptyCounts();
  const items: FieldPendingItem[] = [];

  const runPo = activeSources.includes("PURCHASE_ORDER");
  const runLog = activeSources.includes("JOBSITE_LOG");
  const runCert = activeSources.includes("CERTIFICATION");
  const runSubCert = activeSources.includes("SUBCONTRACT_CERTIFICATION");

  const poListPromise =
    runPo && !countsOnly
      ? prisma.purchaseOrder.findMany({
          where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...projectWhere },
          orderBy: { createdAt: "asc" },
          take: INBOX_LIMIT,
          select: {
            id: true,
            number: true,
            totalAmount: true,
            currency: true,
            createdAt: true,
            createdBy: true,
            originRequestedByUserId: true,
            projectId: true,
            project: { select: { code: true, name: true } },
            supplierContact: { select: { fantasyName: true, legalName: true } },
          },
        })
      : Promise.resolve(null);

  const logListPromise =
    runLog && !countsOnly
      ? prisma.jobsiteLog.findMany({
          where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...projectWhere },
          orderBy: { createdAt: "asc" },
          take: INBOX_LIMIT,
          select: {
            id: true,
            title: true,
            logDate: true,
            createdAt: true,
            createdBy: true,
            projectId: true,
            project: { select: { code: true, name: true } },
          },
        })
      : Promise.resolve(null);

  const certListPromise =
    runCert && !countsOnly
      ? prisma.certification.findMany({
          where: { tenantId: ctx.tenantId, status: "ISSUED", ...projectWhere },
          orderBy: { createdAt: "asc" },
          take: INBOX_LIMIT,
          select: {
            id: true,
            number: true,
            totalAmount: true,
            createdAt: true,
            createdBy: true,
            issueDate: true,
            projectId: true,
            project: { select: { code: true, name: true } },
          },
        })
      : Promise.resolve(null);

  const subCertListPromise =
    runSubCert && !countsOnly
      ? prisma.subcontractCertification.findMany({
          where: { tenantId: ctx.tenantId, status: "ISSUED", ...projectWhere },
          orderBy: { createdAt: "asc" },
          take: INBOX_LIMIT,
          select: {
            id: true,
            number: true,
            createdAt: true,
            createdBy: true,
            projectId: true,
            subcontractId: true,
            project: { select: { code: true, name: true } },
            subcontractorContact: { select: { fantasyName: true, legalName: true } },
          },
        })
      : Promise.resolve(null);

  const [pos, logs, certs, subCerts, poCount, logCount, certCount, subCertCount] = await Promise.all([
    poListPromise,
    logListPromise,
    certListPromise,
    subCertListPromise,
    runPo
      ? prisma.purchaseOrder.count({
          where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...projectWhere },
        })
      : Promise.resolve(0),
    runLog
      ? prisma.jobsiteLog.count({
          where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...projectWhere },
        })
      : Promise.resolve(0),
    runCert
      ? prisma.certification.count({
          where: { tenantId: ctx.tenantId, status: "ISSUED", ...projectWhere },
        })
      : Promise.resolve(0),
    runSubCert
      ? prisma.subcontractCertification.count({
          where: { tenantId: ctx.tenantId, status: "ISSUED", ...projectWhere },
        })
      : Promise.resolve(0),
  ]);

  counts.purchaseOrders = poCount;
  counts.jobsiteLogs = logCount;
  counts.certifications = certCount;
  counts.subcontractCertifications = subCertCount;
  counts.total =
    counts.purchaseOrders +
    counts.jobsiteLogs +
    counts.certifications +
    counts.subcontractCertifications;

  if (countsOnly) {
    return { items: [], counts, queryMs: Date.now() - started };
  }

  const actorIds: Array<string | null> = [];
  if (Array.isArray(pos)) {
    for (const row of pos) actorIds.push(row.originRequestedByUserId, row.createdBy);
  }
  if (Array.isArray(logs)) {
    for (const row of logs) actorIds.push(row.createdBy);
  }
  if (Array.isArray(certs)) {
    for (const row of certs) actorIds.push(row.createdBy);
  }
  if (Array.isArray(subCerts)) {
    for (const row of subCerts) actorIds.push(row.createdBy);
  }
  const names = await resolveUserDisplayNames(actorIds);

  if (Array.isArray(pos)) {
    for (const row of pos) {
      const requestedBy =
        (row.originRequestedByUserId && names.get(row.originRequestedByUserId)) ||
        (row.createdBy && names.get(row.createdBy)) ||
        null;
      items.push({
        entityType: "PURCHASE_ORDER",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "compras",
        typeLabel: "Orden de compra",
        title: `OC-${String(row.number).padStart(3, "0")}`,
        description: row.supplierContact.fantasyName ?? row.supplierContact.legalName,
        statusLabel: "Pendiente de aprobación",
        amount: serializeMoneyDecimal(row.totalAmount),
        currency: row.currency,
        requestedByName: requestedBy,
        occurredAt: row.createdAt,
        href: `/proyectos/${row.projectId}/ordenes-compra/${row.id}`,
        priority: stalePriority(row.createdAt),
      });
    }
  }

  if (Array.isArray(logs)) {
    for (const row of logs) {
      items.push({
        entityType: "JOBSITE_LOG",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "obra",
        typeLabel: "Parte de obra",
        title: row.title?.trim() || "Parte de obra",
        description: null,
        statusLabel: "Pendiente de aprobación",
        amount: null,
        currency: null,
        requestedByName: (row.createdBy && names.get(row.createdBy)) || null,
        occurredAt: row.createdAt,
        href: `/proyectos/${row.projectId}/libro-obra/${row.id}`,
        priority: stalePriority(row.createdAt),
      });
    }
  }

  if (Array.isArray(certs)) {
    for (const row of certs) {
      items.push({
        entityType: "CERTIFICATION",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "certificaciones",
        typeLabel: "Certificación cliente",
        title: `CERT-${String(row.number).padStart(3, "0")}`,
        description: null,
        statusLabel: "Pendiente de aprobación",
        amount: serializeMoneyDecimal(row.totalAmount),
        currency: "ARS",
        requestedByName: (row.createdBy && names.get(row.createdBy)) || null,
        occurredAt: row.issueDate ?? row.createdAt,
        href: `/proyectos/${row.projectId}/certificaciones/${row.id}`,
        priority: stalePriority(row.issueDate ?? row.createdAt),
      });
    }
  }

  if (Array.isArray(subCerts)) {
    for (const row of subCerts) {
      items.push({
        entityType: "SUBCONTRACT_CERTIFICATION",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "certificaciones",
        typeLabel: "Certificación de subcontrato",
        title: `CERT-SC-${String(row.number).padStart(3, "0")}`,
        description:
          row.subcontractorContact.fantasyName ?? row.subcontractorContact.legalName,
        statusLabel: "Pendiente de aprobación",
        amount: null,
        currency: null,
        requestedByName: (row.createdBy && names.get(row.createdBy)) || null,
        occurredAt: row.createdAt,
        href: `/proyectos/${row.projectId}/subcontratos/${row.subcontractId}/certificaciones/${row.id}`,
        priority: stalePriority(row.createdAt),
      });
    }
  }

  items.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return { items, counts, queryMs: Date.now() - started };
}

import { prisma } from "../client";

export type ProjectProgressScope = {
  tenantId: string;
  companyId: string | null;
  activeCompanyId?: string | null;
  projectId: string;
};

export function progressProjectWhere(scope: ProjectProgressScope) {
  return {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    project: { companyId: scope.companyId },
  };
}

/** Nullable documents include the active company's rows and shared rows. */
function nullableDocumentCompany(scope: ProjectProgressScope) {
  return scope.activeCompanyId
    ? { AND: [{ OR: [{ companyId: scope.activeCompanyId }, { companyId: null }] }] }
    : {};
}

/** NOT NULL company ownership on financial documents has no shared variant. */
function requiredDocumentCompany(scope: ProjectProgressScope) {
  return scope.activeCompanyId ? { companyId: scope.activeCompanyId } : {};
}

export async function readProjectProgressBaseline(scope: ProjectProgressScope) {
  const [project, budgets] = await Promise.all([
    prisma.project.findFirst({
      where: { id: scope.projectId, tenantId: scope.tenantId, companyId: scope.companyId },
      select: { name: true },
    }),
    prisma.budget.findMany({
      where: {
        ...progressProjectWhere(scope),
        ...nullableDocumentCompany(scope),
        status: { in: ["APPROVED", "CLOSED"] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        currency: true,
        parentBudgetId: true,
        versionNumber: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  return { project, budgets };
}

export type ProjectProgressSourceAccess = {
  jobsite: boolean;
  schedule: boolean;
  certifications: boolean;
  ar: boolean;
  costs: boolean;
  procurement: boolean;
  subcontracts: boolean;
};

/** One bounded read per source; the service derives all monthly cuts in memory. */
export async function readProjectProgressEvidence(
  scope: ProjectProgressScope,
  budgetIds: string[],
  cut: Date,
  access: ProjectProgressSourceAccess,
) {
  const where = progressProjectWhere(scope);
  const invoiceAllocationSelect = {
    id: true,
    tenantId: true,
    companyId: true,
    projectId: true,
    status: true,
    issueDate: true,
    currency: true,
    documentKind: true,
    totalAmount: true,
    purchaseOrderId: true,
    subcontractCertificationId: true,
    lines: {
      select: {
        wbsNodeId: true,
        lineSubtotal: true,
        lineTotal: true,
        purchaseOrderLineId: true,
        purchaseOrderLine: { select: { wbsNodeId: true } },
      },
    },
    purchaseOrder: {
      select: {
        lines: { select: { id: true, wbsNodeId: true, lineSubtotal: true, lineTotal: true } },
      },
    },
    subcontractCertification: {
      select: {
        lines: {
          select: {
            lineTotal: true,
            subcontractLine: { select: { id: true, wbsNodeId: true } },
          },
        },
      },
    },
  } as const;
  const invoiceSelect = {
    ...invoiceAllocationSelect,
    referencedSupplierInvoice: { select: invoiceAllocationSelect },
  } as const;
  const [
    nodes,
    logs,
    scheduleItems,
    certifications,
    invoices,
    orders,
    subcontracts,
    subCerts,
    supplierInvoices,
    payments,
  ] = await Promise.all([
    prisma.wbsNode.findMany({
      where: {
        budgetId: { in: budgetIds },
        type: "ITEM",
        budget: { ...where, ...nullableDocumentCompany(scope) },
      },
      select: {
        id: true,
        code: true,
        name: true,
        budgetId: true,
        costItem: {
          select: {
            unit: true,
            quantity: true,
            totalCostDirect: true,
            totalSalePrice: true,
            unitSalePrice: true,
          },
        },
      },
    }),
    access.jobsite
      ? prisma.jobsiteLog.findMany({
          where: {
            ...where,
            ...requiredDocumentCompany(scope),
            logDate: { lte: cut },
            status: { in: ["APPROVED", "SUBMITTED"] },
          },
          select: {
            id: true,
            logDate: true,
            status: true,
            progress: {
              where: { wbsNode: { budgetId: { in: budgetIds } } },
              select: {
                wbsNodeId: true,
                quantityCompleted: true,
                physicalPct: true,
              },
            },
          },
          orderBy: { logDate: "asc" },
        })
      : [],
    access.schedule
      ? prisma.scheduleItem.findMany({
          where: { tenantId: scope.tenantId, schedule: where, status: { not: "CANCELLED" } },
          select: {
            id: true,
            parentId: true,
            name: true,
            type: true,
            status: true,
            progressPct: true,
            startDate: true,
            endDate: true,
            durationDays: true,
            blockReason: true,
            wbsLinks: { where: { isPrimary: true }, select: { wbsNodeId: true } },
          },
        })
      : [],
    access.certifications
      ? prisma.certification.findMany({
          where: {
            ...where,
            ...nullableDocumentCompany(scope),
            budgetId: { in: budgetIds },
            status: { not: "CANCELLED" },
          },
          select: {
            id: true,
            number: true,
            status: true,
            periodEnd: true,
            issueDate: true,
            totalAmount: true,
            lines: { select: { wbsNodeId: true, currentQty: true, periodAmount: true } },
            salesInvoices: {
              where: {
                status: "ISSUED",
                documentKind: "INVOICE",
                tenantId: scope.tenantId,
                ...requiredDocumentCompany(scope),
              },
              select: { id: true },
            },
          },
        })
      : [],
    access.ar
      ? prisma.salesInvoice.findMany({
          where: {
            ...where,
            status: "ISSUED",
            documentKind: { in: ["INVOICE", "DEBIT_NOTE"] },
            ...requiredDocumentCompany(scope),
            issueDate: { lte: cut },
            OR: [
              { certification: { budgetId: { in: budgetIds } } },
              { referencedSalesInvoice: { certification: { budgetId: { in: budgetIds } } } },
            ],
          },
          select: {
            id: true,
            issueDate: true,
            dueDate: true,
            currency: true,
            totalAmount: true,
            receivable: {
              select: {
                originalAmount: true,
                status: true,
                collections: {
                  where: {
                    status: "CONFIRMED",
                    collectionDate: { lte: cut },
                    tenantId: scope.tenantId,
                    ...requiredDocumentCompany(scope),
                    projectId: scope.projectId,
                  },
                  select: { amount: true, collectionDate: true, currency: true },
                },
                creditApplications: {
                  where: {
                    status: "CONFIRMED",
                    tenantId: scope.tenantId,
                    creditNoteSalesInvoice: { status: "ISSUED", issueDate: { lte: cut } },
                    ...requiredDocumentCompany(scope),
                  },
                  select: { amount: true, creditNoteSalesInvoice: { select: { issueDate: true } } },
                },
              },
            },
          },
        })
      : [],
    access.costs && access.procurement
      ? prisma.purchaseOrder.findMany({
          where: {
            ...where,
            status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
            ...requiredDocumentCompany(scope),
            issueDate: { lte: cut },
          },
          select: {
            id: true,
            currency: true,
            issueDate: true,
            lines: { select: { id: true, wbsNodeId: true, lineSubtotal: true } },
          },
        })
      : [],
    access.costs && access.subcontracts
      ? prisma.subcontract.findMany({
          where: {
            ...where,
            ...requiredDocumentCompany(scope),
            status: "ACTIVE",
            contractDate: { lte: cut },
          },
          select: {
            id: true,
            currency: true,
            contractDate: true,
            lines: { select: { id: true, wbsNodeId: true, lineTotal: true } },
          },
        })
      : [],
    access.costs && access.subcontracts
      ? prisma.subcontractCertification.findMany({
          where: {
            ...where,
            ...requiredDocumentCompany(scope),
            status: "APPROVED",
            certificationDate: { lte: cut },
          },
          select: {
            certificationDate: true,
            subcontract: { select: { currency: true } },
            lines: {
              select: {
                lineTotal: true,
                subcontractLine: { select: { id: true, wbsNodeId: true } },
              },
            },
          },
        })
      : [],
    access.costs
      ? prisma.supplierInvoice.findMany({
          where: {
            ...where,
            status: "ISSUED",
            issueDate: { lte: cut },
            documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
            ...requiredDocumentCompany(scope),
          },
          select: invoiceSelect,
        })
      : [],
    access.costs
      ? prisma.payment.findMany({
          where: {
            ...where,
            ...requiredDocumentCompany(scope),
            status: "CONFIRMED",
            paymentDate: { lte: cut },
          },
          select: {
            amount: true,
            paymentDate: true,
            currency: true,
            supplierInvoice: { select: invoiceSelect },
          },
        })
      : [],
  ]);
  return {
    nodes,
    logs,
    scheduleItems,
    certifications,
    invoices,
    orders,
    subcontracts,
    subCerts,
    supplierInvoices,
    payments,
  };
}

type LoadedProjectProgressEvidence = Awaited<ReturnType<typeof readProjectProgressEvidence>>;
export type ProjectProgressEvidence = {
  [Key in keyof LoadedProjectProgressEvidence]: LoadedProjectProgressEvidence[Key][number][];
};

import type { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

type ObligationScope = {
  tenantId: string;
  companyId: string;
  projectId: string | null;
  currency: string;
  originalAmount: Prisma.Decimal;
  paidAmount?: Prisma.Decimal;
  creditedAmount?: Prisma.Decimal;
};

/** Check the persisted graph before exposing labels or money from related records. */
export function assertObligationReadIntegrity(
  row: ObligationScope,
  parents: {
    company: { id: string; tenantId: string };
    contact: { id: string; tenantId: string };
    contactId: string;
    project: { id: string; tenantId: string; companyId: string | null } | null;
    invoice: Omit<ObligationScope, "originalAmount" | "paidAmount" | "creditedAmount"> & { id: string; contactId: string; totalAmount: Prisma.Decimal; documentKind: string; status: string };
    invoiceId: string;
  },
): void {
  const { company, contact, project, invoice } = parents;
  if (
    row.originalAmount.lte(0) || row.paidAmount?.lt(0) || row.creditedAmount?.lt(0) ||
    (row.paidAmount && row.creditedAmount && row.paidAmount.plus(row.creditedAmount).minus(row.originalAmount).gte("0.01")) ||
    company.id !== row.companyId || company.tenantId !== row.tenantId ||
    contact.id !== parents.contactId || contact.tenantId !== row.tenantId ||
    (row.projectId === null ? project !== null : !project || project.id !== row.projectId || project.tenantId !== row.tenantId || (project.companyId !== null && project.companyId !== row.companyId)) ||
    invoice.id !== parents.invoiceId || invoice.tenantId !== row.tenantId ||
    invoice.companyId !== row.companyId || invoice.projectId !== row.projectId ||
    invoice.contactId !== contact.id || invoice.currency !== row.currency ||
    !invoice.totalAmount.equals(row.originalAmount) || invoice.documentKind === "CREDIT_NOTE" || invoice.status !== "ISSUED"
  ) {
    throw new ServiceError("FORBIDDEN", "La obligación contiene relaciones fuera de su ámbito");
  }
}

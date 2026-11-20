import { prisma } from "../client";

export type PurchaseOrderDocumentScope = {
  id: string;
  tenantId: string;
  companyId: string;
  projectId: string;
  supplierContactId: string;
};

/** Commercial identities only, after service authorization of the purchase order. */
export async function readPurchaseOrderDocumentParties(scope: PurchaseOrderDocumentScope) {
  return prisma.purchaseOrder.findFirst({
    where: {
      ...scope,
      company: { tenantId: scope.tenantId },
      supplierContact: { tenantId: scope.tenantId },
      project: {
        tenantId: scope.tenantId,
        OR: [{ companyId: scope.companyId }, { companyId: null }],
      },
    },
    select: {
      company: { select: { name: true, legalName: true, fiscalId: true, address: true, city: true, country: true } },
      supplierContact: { select: { legalName: true, taxId: true, address: true, city: true, province: true, country: true } },
      project: { select: { code: true, name: true, address: true, city: true, province: true, country: true } },
    },
  });
}

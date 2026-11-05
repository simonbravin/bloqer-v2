import { prisma } from "@bloqer/database";
import {
  displayMovementDescription,
  salesInvoiceDocumentRef,
  supplierInvoiceDocumentRef,
} from "./movement-document-ref";

export type CashSourceDocumentRefMaps = {
  /** Payment.id → FP-##### */
  byPaymentId: Map<string, string | null>;
  /** Collection.id → FAC-##### */
  byCollectionId: Map<string, string | null>;
};

export type CashSourceProjectMaps = {
  byPaymentId: Map<string, string | null>;
  byCollectionId: Map<string, string | null>;
};

/** One payment/collection batch: projectId + internal invoice code. */
export async function loadCashSourceMeta(
  tenantId: string,
  paymentIds: string[],
  collectionIds: string[],
): Promise<{
  documentRefs: CashSourceDocumentRefMaps;
  projects: CashSourceProjectMaps;
}> {
  const uniquePayments = [...new Set(paymentIds.filter(Boolean))];
  const uniqueCollections = [...new Set(collectionIds.filter(Boolean))];

  const [payments, collections] = await Promise.all([
    uniquePayments.length > 0
      ? prisma.payment.findMany({
          where: { tenantId, id: { in: uniquePayments } },
          select: {
            id: true,
            companyId: true,
            projectId: true,
            supplierInvoice: { select: { number: true, tenantId: true, companyId: true } },
          },
        })
      : Promise.resolve([]),
    uniqueCollections.length > 0
      ? prisma.collection.findMany({
          where: { tenantId, id: { in: uniqueCollections } },
          select: {
            id: true,
            companyId: true,
            projectId: true,
            salesInvoice: { select: { number: true, tenantId: true, companyId: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    documentRefs: {
      byPaymentId: new Map(
        payments.map((p) => [p.id, p.supplierInvoice?.tenantId === tenantId && p.supplierInvoice.companyId === p.companyId ? supplierInvoiceDocumentRef(p.supplierInvoice.number) : null]),
      ),
      byCollectionId: new Map(
        collections.map((c) => [c.id, c.salesInvoice?.tenantId === tenantId && c.salesInvoice.companyId === c.companyId ? salesInvoiceDocumentRef(c.salesInvoice.number) : null]),
      ),
    },
    projects: {
      byPaymentId: new Map(payments.map((p) => [p.id, p.projectId])),
      byCollectionId: new Map(collections.map((c) => [c.id, c.projectId])),
    },
  };
}

export function documentRefForCashSource(
  sourceType: string,
  sourceId: string | null | undefined,
  maps: CashSourceDocumentRefMaps,
): string | null {
  if (!sourceId) return null;
  if (sourceType === "PAYMENT") return maps.byPaymentId.get(sourceId) ?? null;
  if (sourceType === "COLLECTION") return maps.byCollectionId.get(sourceId) ?? null;
  return null;
}

export function humanizeCashMovementDescription(
  description: string,
  sourceType: string,
  sourceId: string | null | undefined,
  maps: CashSourceDocumentRefMaps,
): string {
  return displayMovementDescription(
    description,
    sourceType,
    documentRefForCashSource(sourceType, sourceId, maps),
  );
}

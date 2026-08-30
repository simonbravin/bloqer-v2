/**
 * Attach derived financial document class ([D-102]) to service DTOs.
 * Pure classification lives in @bloqer/domain; this module maps filters to Prisma.
 */

import {
  classifyAccountMovement,
  classifySalesInvoice,
  classifySupplierInvoice,
  isFinancialDocumentClassCode,
  MOVEMENT_CLASS_FILTER_CODES,
  SALES_INVOICE_CLASS_FILTER_CODES,
  SUPPLIER_INVOICE_CLASS_FILTER_CODES,
  type FinancialDocumentClass,
  type FinancialDocumentClassCode,
} from "@bloqer/domain";
import type { Prisma } from "@bloqer/database";

export type FinancialClassFields = {
  classCode: FinancialDocumentClassCode;
  classLabel: string;
  classFamily: FinancialDocumentClass["family"];
};

export function toClassFields(c: FinancialDocumentClass): FinancialClassFields {
  return {
    classCode: c.classCode,
    classLabel: c.classLabel,
    classFamily: c.family,
  };
}

export function classFieldsForSalesInvoice(input: {
  projectId: string | null | undefined;
  certificationId?: string | null | undefined;
}): FinancialClassFields {
  return toClassFields(classifySalesInvoice(input));
}

export function classFieldsForSupplierInvoice(input: {
  projectId: string | null | undefined;
  purchaseOrderId?: string | null | undefined;
  hasPoLineLink?: boolean | null | undefined;
  subcontractCertificationId?: string | null | undefined;
}): FinancialClassFields {
  return toClassFields(classifySupplierInvoice(input));
}

export function classFieldsForAccountMovement(input: {
  type: string;
  sourceType: string;
}): FinancialClassFields {
  return toClassFields(classifyAccountMovement(input));
}

/** Parse `?class=` for sales invoice lists; null = no filter; invalid → null (ignore). */
export function parseSalesInvoiceClassFilter(
  value: string | null | undefined,
): FinancialDocumentClassCode | null {
  if (!value || !isFinancialDocumentClassCode(value)) return null;
  if (!(SALES_INVOICE_CLASS_FILTER_CODES as string[]).includes(value)) return null;
  return value;
}

export function parseSupplierInvoiceClassFilter(
  value: string | null | undefined,
): FinancialDocumentClassCode | null {
  if (!value || !isFinancialDocumentClassCode(value)) return null;
  if (!(SUPPLIER_INVOICE_CLASS_FILTER_CODES as string[]).includes(value)) return null;
  return value;
}

export function parseMovementClassFilter(
  value: string | null | undefined,
): FinancialDocumentClassCode | null {
  if (!value || !isFinancialDocumentClassCode(value)) return null;
  if (!(MOVEMENT_CLASS_FILTER_CODES as string[]).includes(value)) return null;
  return value;
}

export function salesInvoiceClassWhere(
  classCode: FinancialDocumentClassCode,
): Prisma.SalesInvoiceWhereInput {
  switch (classCode) {
    case "SALE_CERT":
      return { projectId: { not: null }, certificationId: { not: null } };
    case "SALE_PROJECT":
      return { projectId: { not: null }, certificationId: null };
    case "INCOME_CORPORATE":
      return { projectId: null };
    default:
      return {};
  }
}

export function supplierInvoiceClassWhere(
  classCode: FinancialDocumentClassCode,
): Prisma.SupplierInvoiceWhereInput {
  switch (classCode) {
    case "SUBCONTRACT":
      return { subcontractCertificationId: { not: null } };
    case "PURCHASE_COMMITTED":
      return {
        subcontractCertificationId: null,
        OR: [
          { purchaseOrderId: { not: null } },
          { lines: { some: { purchaseOrderLineId: { not: null } } } },
        ],
      };
    case "DIRECT_PROJECT":
      return {
        projectId: { not: null },
        purchaseOrderId: null,
        subcontractCertificationId: null,
        lines: { none: { purchaseOrderLineId: { not: null } } },
      };
    case "OVERHEAD":
      return {
        projectId: null,
        subcontractCertificationId: null,
        purchaseOrderId: null,
        lines: { none: { purchaseOrderLineId: { not: null } } },
      };
    default:
      return {};
  }
}

/**
 * Map movement class filter to Prisma predicates (sourceType / type).
 * Avoids post-filter pagination drift.
 */
export function accountMovementClassWhere(
  classCode: FinancialDocumentClassCode,
): Prisma.AccountMovementWhereInput {
  switch (classCode) {
    case "COLLECTION":
      return { sourceType: "COLLECTION" };
    case "PAYMENT":
      return { sourceType: "PAYMENT" };
    case "TRANSFER":
      return {
        OR: [
          { sourceType: "INTERNAL_TRANSFER" },
          { type: { in: ["TRANSFER_IN", "TRANSFER_OUT"] } },
        ],
      };
    case "INCOME_CASH":
      return {
        type: "INFLOW",
        sourceType: { notIn: ["COLLECTION", "INTERNAL_TRANSFER"] },
      };
    case "OVERHEAD":
      return {
        OR: [
          {
            type: "OUTFLOW",
            sourceType: { notIn: ["PAYMENT", "INTERNAL_TRANSFER"] },
          },
          { type: "ADJUSTMENT" },
        ],
      };
    default:
      return {};
  }
}

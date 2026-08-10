import { prisma } from "@bloqer/database";
import type { InvoiceLetter } from "@bloqer/database";
import {
  suggestInvoiceLetter,
  type IvaConditionCode,
} from "@bloqer/domain";

/**
 * Suggest invoice letter for an AP draft (supplier = issuer, company = receiver) — [D-084].
 * Returns null when data is insufficient.
 */
export async function resolveSuggestedApInvoiceLetter(params: {
  companyId: string;
  supplierContactId: string;
  tenantId: string;
}): Promise<InvoiceLetter | null> {
  const [company, supplier] = await Promise.all([
    prisma.company.findFirst({
      where: { id: params.companyId, tenantId: params.tenantId },
      select: { country: true, ivaCondition: true },
    }),
    prisma.contact.findFirst({
      where: { id: params.supplierContactId, tenantId: params.tenantId },
      select: { country: true, ivaCondition: true },
    }),
  ]);
  if (!company || !supplier) return null;

  return suggestInvoiceLetter({
    issuerIvaCondition: (supplier.ivaCondition as IvaConditionCode | null) ?? null,
    receiverIvaCondition: (company.ivaCondition as IvaConditionCode | null) ?? null,
    receiverCountry: company.country,
  }) as InvoiceLetter | null;
}

/**
 * Suggest invoice letter for an AR draft (company = issuer, client = receiver) — [D-084].
 */
export async function resolveSuggestedArInvoiceLetter(params: {
  companyId: string;
  clientContactId: string;
  tenantId: string;
}): Promise<InvoiceLetter | null> {
  const [company, client] = await Promise.all([
    prisma.company.findFirst({
      where: { id: params.companyId, tenantId: params.tenantId },
      select: { country: true, ivaCondition: true },
    }),
    prisma.contact.findFirst({
      where: { id: params.clientContactId, tenantId: params.tenantId },
      select: { country: true, ivaCondition: true },
    }),
  ]);
  if (!company || !client) return null;

  return suggestInvoiceLetter({
    issuerIvaCondition: (company.ivaCondition as IvaConditionCode | null) ?? null,
    receiverIvaCondition: (client.ivaCondition as IvaConditionCode | null) ?? null,
    receiverCountry: client.country,
  }) as InvoiceLetter | null;
}

import { sanitizeIsoDate } from "@bloqer/services";
import { z } from "zod";

export function parseAccountingCompanyId(sp: Record<string, string>): string | null {
  const raw = sp.empresa || sp.companyId;
  if (!raw) return null;
  const parsed = z.string().uuid().safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseAccountingDateRange(sp: Record<string, string>): {
  companyId: string | null;
  dateFrom?: string;
  dateTo?: string;
} {
  return {
    companyId: parseAccountingCompanyId(sp),
    dateFrom: sanitizeIsoDate(sp.dateFrom),
    dateTo: sanitizeIsoDate(sp.dateTo),
  };
}

export function parseAccountingAsOf(sp: Record<string, string>): {
  companyId: string | null;
  asOfDate?: string;
} {
  return {
    companyId: parseAccountingCompanyId(sp),
    asOfDate: sanitizeIsoDate(sp.asOfDate),
  };
}

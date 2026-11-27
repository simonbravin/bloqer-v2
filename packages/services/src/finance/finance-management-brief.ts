import { Prisma } from "@bloqer/database";
import type { AgingReport } from "../aging/aging.service";
import { buildFinancialHref } from "./financial-trace.service";
import { serializeMoneyDecimal } from "./money-decimal";
import { hasOpenObligationBalance, parseObligationAsOfDate } from "./obligation-date";

export type FinanceBriefItem = {
  id: string;
  contactName: string;
  companyName: string | null;
  projectName: string;
  documentNumber: number;
  dueDate: string;
  balanceDue: string;
  currency: string;
  href: string;
};

export type FinanceBriefWindow = {
  count: number;
  totals: { currency: string; amount: string }[];
  items: FinanceBriefItem[];
};

export type FinanceBriefSection = {
  available: boolean;
  overdue: FinanceBriefWindow | null;
  upcoming: FinanceBriefWindow | null;
};

export type FinanceManagementBrief = {
  asOfDate: string;
  throughDate: string;
  companyId: string | null;
  receivables: FinanceBriefSection;
  payables: FinanceBriefSection;
};

function summarize(items: FinanceBriefItem[]): FinanceBriefWindow {
  const totals = new Map<string, Prisma.Decimal>();
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? new Prisma.Decimal(0)).add(item.balanceDue));
  }
  return {
    count: items.length,
    totals: [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount: serializeMoneyDecimal(amount) })),
    items: [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)).slice(0, 5),
  };
}

/** Presentation of already-authorized aging sources. No additional reads or payment recommendation. */
export function buildFinanceManagementBrief(input: {
  asOfDate: string;
  companyId: string | null;
  receivables: AgingReport | null;
  payables: AgingReport | null;
}): FinanceManagementBrief {
  const end = parseObligationAsOfDate(input.asOfDate);
  end.setUTCDate(end.getUTCDate() + 7);
  const throughDate = end.toISOString().slice(0, 10);
  function section(report: AgingReport | null, kind: "Receivable" | "Payable"): FinanceBriefSection {
    if (!report || report.asOfDate !== input.asOfDate) return { available: false, overdue: null, upcoming: null };
    const overdue: FinanceBriefItem[] = [];
    const upcoming: FinanceBriefItem[] = [];
    for (const row of report.rows) {
      for (const item of row.items) {
        if (item.status === "PAID" || item.status === "CANCELLED" || !hasOpenObligationBalance(new Prisma.Decimal(item.balanceDue))) continue;
        const view: FinanceBriefItem = {
          id: item.id, contactName: row.contactName, companyName: item.companyName ?? null,
          projectName: item.projectName, documentNumber: item.invoiceNumber,
          dueDate: item.dueDate, balanceDue: item.balanceDue, currency: item.currency,
          href: buildFinancialHref(kind, item.id, { projectId: item.projectId }),
        };
        if (item.daysOverdue > 0) overdue.push(view);
        else if (item.dueDate >= input.asOfDate && item.dueDate <= throughDate) upcoming.push(view);
      }
    }
    return { available: true, overdue: summarize(overdue), upcoming: summarize(upcoming) };
  }
  return {
    asOfDate: input.asOfDate, throughDate, companyId: input.companyId,
    receivables: section(input.receivables, "Receivable"), payables: section(input.payables, "Payable"),
  };
}

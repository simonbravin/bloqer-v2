/**
 * Field-level minimization helpers — only fields useful for LLM answers.
 * Never pass Prisma models or audit/PII blobs to the model.
 */

export type AiAgingTopItem = {
  contactName: string;
  projectName: string;
  invoiceNumber: number;
  dueDate: string;
  daysOverdue: number;
  balanceDue: string;
  currency: string;
  status: string;
};

export function minimizeAgingTopItem(raw: {
  contactName: string;
  projectName?: string;
  invoiceNumber?: number;
  dueDate?: string;
  daysOverdue?: number;
  balanceDue?: string;
  currency?: string;
  status?: string;
}): AiAgingTopItem {
  return {
    contactName: raw.contactName,
    projectName: raw.projectName ?? "",
    invoiceNumber: raw.invoiceNumber ?? 0,
    dueDate: raw.dueDate ?? "",
    daysOverdue: raw.daysOverdue ?? 0,
    balanceDue: raw.balanceDue ?? "0",
    currency: raw.currency ?? "ARS",
    status: raw.status ?? "",
  };
}

export type AiCashPositionDto = {
  balanceByCurrency: Array<{ currency: string; amount: string }>;
  monthlyInflowByCurrency: Array<{ currency: string; amount: string }>;
  monthlyOutflowByCurrency: Array<{ currency: string; amount: string }>;
  accountCount: number;
  recentMovements: Array<{
    type: string;
    amount: string;
    currency: string;
    movementDate: string;
    description: string | null;
  }>;
};

export function minimizeCashPosition(hub: {
  balanceByCurrency: Array<{ currency: string; amount: string }>;
  monthlyInflowByCurrency: Array<{ currency: string; amount: string }>;
  monthlyOutflowByCurrency: Array<{ currency: string; amount: string }>;
  accounts: unknown[];
  recentMovements: Array<{
    id: string;
    type: string;
    amount: string;
    currency: string;
    movementDate: string | Date;
    description: string | null;
    accountName?: string;
    href?: string;
  }>;
}): AiCashPositionDto {
  return {
    balanceByCurrency: hub.balanceByCurrency,
    monthlyInflowByCurrency: hub.monthlyInflowByCurrency,
    monthlyOutflowByCurrency: hub.monthlyOutflowByCurrency,
    accountCount: hub.accounts.length,
    recentMovements: hub.recentMovements.slice(0, 8).map((m) => ({
      type: m.type,
      amount: m.amount,
      currency: m.currency,
      movementDate:
        m.movementDate instanceof Date
          ? m.movementDate.toISOString().slice(0, 10)
          : String(m.movementDate).slice(0, 10),
      description: m.description,
      // intentionally omit accountName / href / id (minimize bank surface)
    })),
  };
}

/** Truncate free-text notes (prompt-injection surface) for the model. */
export function minimizeNotes(notes: string | null | undefined, max = 280): string | null {
  if (!notes) return null;
  const t = notes.trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

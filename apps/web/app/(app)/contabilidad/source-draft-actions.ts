"use server";

import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import {
  ServiceError,
  suggestJournalFromCollection,
  suggestJournalFromPayment,
  suggestJournalFromStockMovement,
  suggestJournalFromTreasuryMovement,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { contabilidadAsientoHref } from "@/lib/contabilidad-asiento-path";

function appendQueryParam(path: string, key: string, value: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${key}=${encodeURIComponent(value)}`;
}

async function accountingCtxOrRedirect() {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.roles, "EDIT", "ACCOUNTING")) {
    redirect("/dashboard");
  }
  return ctx;
}

async function redirectToJournal(entry: { id: string; companyId: string }) {
  const current = await getCurrentUser();
  redirect(
    contabilidadAsientoHref(entry.id, entry.companyId, current?.tenantCtx?.companyId),
  );
}

export async function generateJournalFromCollectionAction(collectionId: string, errorReturnPath: string) {
  const ctx = await accountingCtxOrRedirect();
  try {
    const entry = await suggestJournalFromCollection(collectionId, ctx);
    await redirectToJournal(entry);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(appendQueryParam(errorReturnPath, "contabilidad", e.message));
    }
    throw e;
  }
}

export async function generateJournalFromPaymentAction(paymentId: string, errorReturnPath: string) {
  const ctx = await accountingCtxOrRedirect();
  try {
    const entry = await suggestJournalFromPayment(paymentId, ctx);
    await redirectToJournal(entry);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(appendQueryParam(errorReturnPath, "contabilidad", e.message));
    }
    throw e;
  }
}

export async function generateJournalFromTreasuryMovementAction(movementId: string, errorReturnPath: string) {
  const ctx = await accountingCtxOrRedirect();
  try {
    const entry = await suggestJournalFromTreasuryMovement(movementId, ctx);
    await redirectToJournal(entry);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(appendQueryParam(errorReturnPath, "contabilidad", e.message));
    }
    throw e;
  }
}

export async function generateJournalFromStockMovementAction(stockMovementId: string, errorReturnPath: string) {
  const ctx = await accountingCtxOrRedirect();
  try {
    const entry = await suggestJournalFromStockMovement(stockMovementId, ctx);
    await redirectToJournal(entry);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(appendQueryParam(errorReturnPath, "contabilidad", e.message));
    }
    throw e;
  }
}

import type { Metadata } from "next";
import { supplierQuoteLinksEnabled } from "@bloqer/config";
import { SupplierQuoteLanding } from "@/features/procurement/components/supplier-quote-landing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Responder cotización · Bloqer", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function SupplierQuotePage({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  return <main className="mx-auto min-h-dvh w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
    <header><p className="text-sm font-semibold tracking-wide text-muted-foreground">BLOQER · COMPRAS</p><h1 className="mt-2 text-2xl font-bold tracking-tight">Responder cotización</h1></header>
    <SupplierQuoteLanding invitationId={invitationId} enabled={supplierQuoteLinksEnabled()} />
  </main>;
}

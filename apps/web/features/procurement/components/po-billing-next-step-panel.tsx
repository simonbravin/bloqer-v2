import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { can } from "@bloqer/domain";
import { createSupplierInvoiceFromPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import type { PurchaseOrderBillingSummary } from "@bloqer/services";
import { formatMoneyAmount, isPositiveMoneyAmount } from "@/lib/format-money";
import { ProcurementAmberCallout } from "./procurement-amber-callout";
import { procurementActionBtnClass } from "../lib/procurement-ui";

type Props = {
  projectId: string;
  purchaseOrderId: string;
  purchaseReceiptId?: string;
  billing: PurchaseOrderBillingSummary;
  canEditAp: boolean;
  /** Ruta a la que volver si falla la creación del borrador (sin reintentar en cada refresh). */
  errorReturnPath: string;
  /** Highlight as the immediate next step (e.g. from Pendientes ?siguiente=facturar). */
  highlighted?: boolean;
};

export function PoBillingNextStepPanel({
  projectId,
  purchaseOrderId,
  purchaseReceiptId,
  billing,
  canEditAp,
  errorReturnPath,
  highlighted = false,
}: Props) {
  const pending = isPositiveMoneyAmount(billing.pendingToInvoice);
  const showRegister = billing.hasReceivedQuantity && pending;
  const draftHref = billing.openDraftInvoiceId
    ? `/proyectos/${projectId}/facturas-proveedor/${billing.openDraftInvoiceId}`
    : null;

  return (
    <div
      id="facturar"
      tabIndex={-1}
      className={
        highlighted
          ? "scroll-mt-24 rounded-lg border bg-muted/30 p-4 space-y-3 ring-2 ring-primary transition-shadow outline-none"
          : "scroll-mt-24 rounded-lg border bg-muted/30 p-4 space-y-3 outline-none"
      }
    >
      <div className="text-sm space-y-1">
        <p className="font-medium">Facturación de la OC</p>
        {billing.hasReceivedQuantity ? (
          <p className="text-muted-foreground text-xs">
            Recibido: {formatMoneyAmount(billing.receivedAmount)} · Facturado (emitido):{" "}
            {formatMoneyAmount(billing.invoicedAmount)} · Pagado: {formatMoneyAmount(billing.paidAmount)}
            {billing.draftInvoiceCount > 0
              ? ` · ${billing.draftInvoiceCount} borrador(es) (${formatMoneyAmount(billing.draftReservedAmount)})`
              : null}
            {pending
              ? ` · Pendiente de facturar: ${formatMoneyAmount(billing.pendingToInvoice)}`
              : null}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Sin cantidades recibidas. Confirmá una recepción antes de registrar la factura del
            proveedor.
          </p>
        )}
        {billing.matchWarningCount > 0 ? (
          <ProcurementAmberCallout inset>
            <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
              Matching 3 vías: {billing.matchWarningCount} aviso(s) (no bloquea emitir)
            </p>
            <ul className="text-xs text-amber-900/90 dark:text-amber-100/90 list-disc pl-4 space-y-0.5">
              {billing.lineMatches
                .filter((l) => l.message)
                .slice(0, 5)
                .map((l) => (
                  <li key={l.poLineId}>{l.message}</li>
                ))}
            </ul>
          </ProcurementAmberCallout>
        ) : null}
        {showRegister ? (
          <p className="text-xs text-muted-foreground">
            La recepción no genera deuda automáticamente. Registrá la factura del proveedor y
            emitila para crear la cuenta por pagar
            {draftHref ? " (o completá el borrador abierto)." : "."}
          </p>
        ) : billing.draftInvoiceCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Hay factura(s) en borrador vinculada(s) a esta OC
            {billing.draftInvoiceCount === 1 ? "" : ` (${billing.draftInvoiceCount})`}. Completala y
            emitila para crear la CxP.
          </p>
        ) : null}
      </div>

      {canEditAp ? (
        <div className="flex flex-wrap items-center gap-2">
          {draftHref ? (
            <Button asChild className={procurementActionBtnClass}>
              <Link href={draftHref}>Completar factura</Link>
            </Button>
          ) : null}
          {showRegister ? (
            <form
              action={async () => {
                "use server";
                const res = await createSupplierInvoiceFromPurchaseOrderAction(projectId, {
                  purchaseOrderId,
                  purchaseReceiptId: purchaseReceiptId ?? null,
                  basis: "received",
                });
                if ("error" in res) {
                  const errQuery = new URLSearchParams({ invoiceError: res.error });
                  redirect(`${errorReturnPath}?${errQuery.toString()}`);
                }
                redirect(`/proyectos/${projectId}/facturas-proveedor/${res.id}`);
              }}
            >
              <Button
                type="submit"
                variant={draftHref ? "outline" : "default"}
                className={draftHref ? undefined : procurementActionBtnClass}
              >
                {draftHref ? "Actualizar borrador" : "Registrar factura"}
              </Button>
            </form>
          ) : null}
        </div>
      ) : showRegister ? (
        <p className="text-xs text-muted-foreground">
          Pedile a Finanzas que registre la factura del proveedor vinculada a esta OC.
        </p>
      ) : draftHref ? (
        <p className="text-xs text-muted-foreground">
          Pedile a Finanzas que complete y emita el borrador de factura.
        </p>
      ) : null}
    </div>
  );
}

export function canRegisterApInvoice(roles: Parameters<typeof can>[0]): boolean {
  return can(roles, "EDIT", "AP");
}

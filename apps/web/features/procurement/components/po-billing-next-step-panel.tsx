import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { can } from "@bloqer/domain";
import { createSupplierInvoiceFromPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import type { PurchaseOrderBillingSummary } from "@bloqer/services";
import { formatMoneyAmount, isPositiveMoneyAmount } from "@/lib/format-money";

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
  const showAction = billing.hasReceivedQuantity && pending;

  return (
    <div
      id="facturar"
      className={
        highlighted
          ? "scroll-mt-24 rounded-lg border-2 border-primary bg-muted/30 p-4 space-y-3 ring-2 ring-primary/20"
          : "scroll-mt-24 rounded-lg border bg-muted/30 p-4 space-y-3"
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
          <div className="rounded border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 p-2 space-y-1">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
              Matching 3 vías: {billing.matchWarningCount} aviso(s) (no bloquea emitir)
            </p>
            <ul className="text-[11px] text-amber-900/90 dark:text-amber-100/90 list-disc pl-4 space-y-0.5">
              {billing.lineMatches
                .filter((l) => l.message)
                .slice(0, 5)
                .map((l) => (
                  <li key={l.poLineId}>{l.message}</li>
                ))}
            </ul>
          </div>
        ) : null}
        {showAction ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            La recepción no genera deuda automáticamente. Registrá la factura del proveedor y
            emitila para crear la cuenta por pagar.
          </p>
        ) : billing.draftInvoiceCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Hay factura(s) en borrador vinculada(s) a esta OC
            {billing.draftInvoiceCount === 1 ? "" : ` (${billing.draftInvoiceCount})`}. Completala y
            emitila desde Facturas proveedor para crear la CxP
            {billing.hasReceivedQuantity && !pending
              ? ""
              : " (o usá Registrar factura si aún falta cantidad)."}.
          </p>
        ) : null}
      </div>

      {canEditAp ? (
        showAction ? (
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
            <Button type="submit">Registrar factura desde OC</Button>
          </form>
        ) : null
      ) : showAction ? (
        <p className="text-xs text-muted-foreground">
          Pedile a Finanzas que registre la factura del proveedor vinculada a esta OC.
        </p>
      ) : null}
    </div>
  );
}

export function canRegisterApInvoice(roles: Parameters<typeof can>[0]): boolean {
  return can(roles, "EDIT", "AP");
}

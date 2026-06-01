import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { can } from "@bloqer/domain";
import { createSupplierInvoiceFromPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import type { PurchaseOrderBillingSummary } from "@bloqer/services";

type Props = {
  projectId: string;
  purchaseOrderId: string;
  purchaseReceiptId?: string;
  billing: PurchaseOrderBillingSummary;
  canEditAp: boolean;
};

export function PoBillingNextStepPanel({
  projectId,
  purchaseOrderId,
  purchaseReceiptId,
  billing,
  canEditAp,
}: Props) {
  const pending = Number.parseFloat(billing.pendingToInvoice);
  const showAction = billing.hasReceivedQuantity && pending > 0;

  const query = new URLSearchParams({ purchaseOrderId });
  if (purchaseReceiptId) query.set("purchaseReceiptId", purchaseReceiptId);
  const invoiceUrl = `/proyectos/${projectId}/facturas-proveedor/nueva?${query.toString()}`;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="text-sm space-y-1">
        <p className="font-medium">Facturación de la OC</p>
        {billing.hasReceivedQuantity ? (
          <p className="text-muted-foreground text-xs">
            Recibido: {billing.receivedAmount} · Facturado: {billing.invoicedAmount} · Pagado:{" "}
            {billing.paidAmount}
            {pending > 0 ? ` · Pendiente de facturar: ${billing.pendingToInvoice}` : null}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Sin cantidades recibidas. Confirmá una recepción antes de registrar la factura del
            proveedor.
          </p>
        )}
        {showAction ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            La recepción no genera deuda automáticamente. Registrá la factura del proveedor y
            emitila para crear la cuenta por pagar.
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
                const errQuery = new URLSearchParams(query);
                errQuery.set("error", res.error);
                redirect(`${invoiceUrl.split("?")[0]}?${errQuery.toString()}`);
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

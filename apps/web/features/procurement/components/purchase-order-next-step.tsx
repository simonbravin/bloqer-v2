const NEXT_STEP = {
  DRAFT: "Compras: revisá la orden y sus justificativos antes de Enviar a aprobación. El borrador todavía no está enviado.",
  SUBMITTED: "El aprobador habilitado debe revisar la orden y aprobarla o devolverla con motivo. Compras puede consultar el resultado desde esta ficha.",
  APPROVED: "Compras: falta Confirmar al proveedor. La aprobación interna todavía no confirma la compra.",
  CONFIRMED: "Obra o Depósito: registrá la recepción cuando los materiales o servicios se reciban realmente. Administración puede revisar la facturación vinculada.",
  PARTIALLY_RECEIVED: "Obra o Depósito: revisá el saldo pendiente y registrá solo lo que recibas. Administración debe revisar las facturas y pagos vinculados.",
  RECEIVED: "Recepción completa. Administración: revisá las facturas y pagos vinculados antes de registrar otros. Recibida no significa pagada.",
  CANCELLED: "Orden anulada. Conservá sus antecedentes y verificá el circuito vigente antes de generar otra compra.",
} as const;

/** Read-only explanation of existing states; never decides permissions or transitions. */
export function PurchaseOrderNextStep({ status }: { status: string }) {
  const message = NEXT_STEP[status as keyof typeof NEXT_STEP];
  if (!message) return null;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Próximo paso: </span>{message}
    </p>
  );
}

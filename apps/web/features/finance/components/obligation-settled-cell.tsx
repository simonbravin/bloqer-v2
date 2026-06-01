/** Etiqueta Pagada/Cobrada derivada del estado de la obligación (es-AR). */
export function obligationSettledLabel(status: string): "Sí" | "Parcial" | "No" | "—" {
  switch (status) {
    case "PAID":
      return "Sí";
    case "PARTIAL":
      return "Parcial";
    case "CANCELLED":
      return "—";
    default:
      return "No";
  }
}

export function ObligationSettledCell({ status }: { status: string }) {
  const label = obligationSettledLabel(status);
  return (
    <span
      className={
        label === "Sí"
          ? "text-emerald-700 dark:text-emerald-400 font-medium"
          : label === "Parcial"
            ? "text-amber-800 dark:text-amber-200 font-medium"
            : "text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}

/** Etiqueta Pagada/Cobrada derivada del estado de la obligación (es-AR). */
export function obligationSettledLabel(
  status: string,
  balanceDue?: string | number | null,
): "Sí" | "Parcial" | "No" | "—" {
  if (status === "CANCELLED") return "—";
  if (balanceDue != null && Number(balanceDue) <= 0) return "Sí";
  switch (status) {
    case "PAID":
      return "Sí";
    case "PARTIAL":
      return "Parcial";
    default:
      return "No";
  }
}

export function ObligationSettledCell({
  status,
  balanceDue,
}: {
  status: string;
  balanceDue?: string | number | null;
}) {
  const label = obligationSettledLabel(status, balanceDue);
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

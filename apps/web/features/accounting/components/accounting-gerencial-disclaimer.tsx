export function AccountingGerencialDisclaimer({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-xs text-muted-foreground rounded-md border bg-muted/30 px-3 py-2"}>
      Información gerencial interna. No sustituye estados contables oficiales ni ajuste por inflación.
    </p>
  );
}

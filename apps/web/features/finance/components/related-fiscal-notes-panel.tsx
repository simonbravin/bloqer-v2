import Link from "next/link";
import { fiscalDocumentKindLabel } from "@bloqer/domain";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { Button } from "@/components/ui/button";
import { FiscalDocumentKindBadge } from "@/features/finance/components/fiscal-document-kind-badge";

export type RelatedFiscalNoteItem = {
  id: string;
  code: string;
  documentKind: "CREDIT_NOTE" | "DEBIT_NOTE" | string;
  status: string;
  totalAmount: string;
  currency: string;
  issueDate: Date;
};

type Props = {
  notes: RelatedFiscalNoteItem[];
  hrefFor: (noteId: string) => string;
};

function statusLabel(status: string): string {
  if (status === "DRAFT") return "Borrador";
  if (status === "ISSUED") return "Emitida";
  if (status === "CANCELLED") return "Anulada";
  return status;
}

export function RelatedFiscalNotesPanel({ notes, hrefFor }: Props) {
  if (notes.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Notas vinculadas</h2>
        <p className="text-xs text-muted-foreground">
          Notas de crédito y débito que referencian este comprobante.
        </p>
      </div>
      <ul className="divide-y">
        {notes.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-medium">{n.code}</span>
                <FiscalDocumentKindBadge documentKind={n.documentKind} />
                <span className="text-xs text-muted-foreground">{statusLabel(n.status)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {fiscalDocumentKindLabel(n.documentKind)} · {formatDate(n.issueDate)} ·{" "}
                {formatMoneyAmount(n.totalAmount, n.currency)}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={hrefFor(n.id)}>Ver</Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

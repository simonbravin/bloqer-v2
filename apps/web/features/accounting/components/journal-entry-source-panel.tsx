import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { JournalEntrySourceLink } from "@bloqer/services";

export function JournalEntrySourcePanel({ link }: { link: JournalEntrySourceLink }) {
  return (
    <div className="rounded-lg border shell-surface-inset p-6 text-sm space-y-3">
      <h2 className="font-semibold text-base">Documento origen</h2>
      <div className="space-y-1">
        <p className="font-medium">{link.kindLabel}</p>
        <p className="text-muted-foreground">{link.detail}</p>
      </div>
      {link.href ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={link.href}>Ir al documento</Link>
        </Button>
      ) : link.noAccessHint ? (
        <p className="text-xs text-muted-foreground">{link.noAccessHint}</p>
      ) : null}
    </div>
  );
}

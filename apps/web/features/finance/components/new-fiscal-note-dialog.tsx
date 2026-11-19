"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoneyAmount } from "@/lib/format-money";
import { listCompanySalesNoteParentsAction } from "@/app/(app)/finanzas/facturas/actions";
import { listCompanySupplierNoteParentsAction } from "@/app/(app)/finanzas/facturas-proveedor/actions";
import { listProjectSalesNoteParentsAction } from "@/app/(app)/proyectos/[id]/facturas/actions";
import { listProjectSupplierNoteParentsAction } from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import { CreateFiscalNoteDialog } from "./create-fiscal-note-dialog";

type ParentInvoice = {
  id: string;
  code: string;
  contactName: string;
  currency: string;
  balanceDue: string;
};

type Props = {
  kind: "CREDIT_NOTE" | "DEBIT_NOTE";
} & (
  | { scope: "company-ar" | "company-ap"; projectId?: never }
  | { scope: "project-ar" | "project-ap"; projectId: string }
);

const PAGE_SIZE = 10;

/** Reuses the note workflow with a reference picker restricted to the current workspace. */
export function NewFiscalNoteDialog(props: Props) {
  const { kind, scope, projectId } = props;
  const isProject = scope === "project-ap" || scope === "project-ar";
  const isSupplier = scope === "company-ap" || scope === "project-ap";
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [parents, setParents] = useState<ParentInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<ParentInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const request = scope === "project-ap"
        ? listProjectSupplierNoteParentsAction(projectId!, search, page)
        : scope === "project-ar"
          ? listProjectSalesNoteParentsAction(projectId!, search, page)
          : scope === "company-ap"
            ? listCompanySupplierNoteParentsAction(search, page)
            : listCompanySalesNoteParentsAction(search, page);
      void request.then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setError(result.error);
          setParents([]);
          setTotal(0);
        } else {
          setError(null);
          setParents(result.data);
          setTotal(result.total);
        }
      }).catch(() => {
        if (cancelled) return;
        setError("No se pudieron cargar las facturas. Volvé a abrir el diálogo para reintentar.");
        setParents([]);
        setTotal(0);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search, page, scope, projectId]);

  return (
    <CreateFiscalNoteDialog
      kind={kind}
      parentInvoiceId={selected?.id ?? ""}
      parentCode={selected?.code ?? ""}
      currency={selected?.currency ?? "ARS"}
      openBalance={selected?.balanceDue}
      scope={isProject ? { type: scope, projectId: projectId! } : { type: scope }}
      triggerLabel={kind === "CREDIT_NOTE" ? "Nueva nota de crédito" : "Nueva nota de débito"}
      triggerSize={isProject ? "sm" : "default"}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSelected(null);
          setSearch("");
          setPage(1);
          setParents([]);
          setError(null);
          setLoading(true);
        }
      }}
      parentSelector={(
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={searchId}>Factura de referencia</Label>
            <Input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
                setLoading(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder={isSupplier ? "Buscar por código o proveedor…" : "Buscar por código o cliente…"}
            />
            <p className="text-xs text-muted-foreground">
              {isProject ? "Solo facturas emitidas de este proyecto." : "Solo facturas emitidas de empresa, sin proyecto."}
            </p>
          </div>
          {selected ? (
            <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              Seleccionada: <strong>{selected.code}</strong> · {selected.contactName} · {selected.currency}
            </p>
          ) : null}
          <div aria-busy={loading} aria-live="polite" className="space-y-1">
            {loading ? (
              <p className="py-2 text-sm text-muted-foreground">Buscando facturas…</p>
            ) : error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : parents.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                {search.trim() ? "No hay facturas emitidas con esta búsqueda." : `No hay facturas emitidas ${isProject ? "en este proyecto" : "de empresa"}. Creá y emití la factura antes de registrar una nota.`}
              </p>
            ) : parents.map((parent) => (
              <Button
                key={parent.id}
                type="button"
                variant={selected?.id === parent.id ? "secondary" : "outline"}
                aria-pressed={selected?.id === parent.id}
                className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                onClick={() => setSelected(parent)}
              >
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-medium">{parent.code} · {parent.contactName}</span>
                  <span className="block text-xs text-muted-foreground">
                    Saldo: {formatMoneyAmount(parent.balanceDue, parent.currency)}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          {total > PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1}
                onClick={() => { setPage((value) => value - 1); setLoading(true); }}>
                Anterior
              </Button>
              <span>Página {page} de {Math.ceil(total / PAGE_SIZE)}</span>
              <Button type="button" variant="outline" size="sm" disabled={loading || page * PAGE_SIZE >= total}
                onClick={() => { setPage((value) => value + 1); setLoading(true); }}>
                Siguiente
              </Button>
            </div>
          ) : null}
        </div>
      )}
    />
  );
}

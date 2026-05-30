"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { AuditLogDetailView } from "./types";
import { AUDIT_UI_MODULE_LABEL_ES, type AuditUiModule } from "@bloqer/domain";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { buildAuditEntityHref } from "./audit-entity-href";
import { describeAuditChanges, entityTypeLabel, type AuditChangeItem } from "./audit-log-changes";

function ChangeRow({ item }: { item: AuditChangeItem }) {
  if (item.kind === "added") {
    return (
      <li className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
        <p className="mt-1 text-sm font-medium text-foreground">{item.after ?? "—"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Valor registrado</p>
      </li>
    );
  }

  if (item.kind === "removed") {
    return (
      <li className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
        <p className="mt-1 text-sm text-muted-foreground line-through">{item.before ?? "—"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Dato ya no aplica</p>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border/80 bg-card px-3 py-2.5 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-muted-foreground">{item.before ?? "—"}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-foreground">
          {item.after ?? "—"}
        </span>
      </div>
    </li>
  );
}

export function AuditLogDetailDialog({
  detail,
  open,
  closeHref,
}: {
  detail: AuditLogDetailView | null;
  open: boolean;
  closeHref: string;
}) {
  const router = useRouter();

  function handleOpenChange(next: boolean) {
    if (!next) router.push(closeHref, { scroll: false });
  }

  const entityHref =
    detail != null
      ? buildAuditEntityHref(detail.entityType, detail.entityId, { projectId: detail.projectId })
      : null;

  const changes = detail ? describeAuditChanges(detail.before, detail.after, detail.action) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {detail ? (
          <>
            <DialogHeader>
              <DialogTitle>{detail.actionLabel}</DialogTitle>
              <DialogDescription>
                {formatDateTime(detail.createdAt)}
                {detail.module ? ` · ${AUDIT_UI_MODULE_LABEL_ES[detail.module as AuditUiModule]}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Usuario</dt>
                  <dd className="font-medium">{detail.actorLabel}</dd>
                  {detail.actorName && detail.actorEmail ? (
                    <dd className="text-xs text-muted-foreground">{detail.actorEmail}</dd>
                  ) : null}
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Entidad</dt>
                  <dd>
                    {entityHref ? (
                      <Link href={entityHref} className="font-medium hover:underline">
                        {entityTypeLabel(detail.entityType)}
                        {detail.reference ? ` ${detail.reference}` : ""}
                      </Link>
                    ) : (
                      <span>
                        {entityTypeLabel(detail.entityType)}
                        {detail.reference ? ` ${detail.reference}` : ""}
                      </span>
                    )}
                  </dd>
                </div>
                {detail.projectName ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Proyecto</dt>
                    <dd>{detail.projectName}</dd>
                  </div>
                ) : null}
                {detail.ipAddress ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">IP</dt>
                    <dd className="font-mono text-xs">{detail.ipAddress}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Qué cambió</h3>
                <p className="mt-1 text-sm text-muted-foreground">{changes?.summary}</p>
              </div>

              {changes && changes.items.length > 0 ? (
                <ul className="space-y-2">
                  {changes.items.map((item) => (
                    <ChangeRow key={item.field} item={item} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
                  No hay campos detallados para comparar en este evento.
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cerrar
              </Button>
              {entityHref ? (
                <Button type="button" asChild>
                  <Link href={entityHref}>Ver entidad</Link>
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Registro no encontrado</DialogTitle>
              <DialogDescription>El registro solicitado no existe o no tenés acceso.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

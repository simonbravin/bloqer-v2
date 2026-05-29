"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuditLogDetailView } from "./types";
import { AUDIT_UI_MODULE_LABEL_ES, type AuditUiModule } from "@bloqer/domain";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { buildAuditEntityHref } from "./audit-entity-href";

function formatJson(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "—";
  }
}

export function AuditLogDetailSheet({
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

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        {detail ? (
          <>
            <SheetHeader>
              <SheetTitle>{detail.actionLabel}</SheetTitle>
              <SheetDescription>
                {formatDateTime(detail.createdAt)}
                {detail.module ? ` · ${AUDIT_UI_MODULE_LABEL_ES[detail.module as AuditUiModule]}` : ""}
              </SheetDescription>
            </SheetHeader>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Actor</dt>
                <dd className="font-medium">{detail.actorLabel}</dd>
                {detail.actorName && detail.actorEmail ? (
                  <dd className="text-xs text-muted-foreground">{detail.actorEmail}</dd>
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground">Entidad</dt>
                <dd>
                  {entityHref ? (
                    <Link href={entityHref} className="font-medium hover:underline">
                      {detail.entityType}
                      {detail.reference ? ` ${detail.reference}` : ""}
                    </Link>
                  ) : (
                    <span>
                      {detail.entityType}
                      {detail.reference ? ` ${detail.reference}` : ""}
                    </span>
                  )}
                </dd>
              </div>
              {detail.projectName ? (
                <div>
                  <dt className="text-muted-foreground">Proyecto</dt>
                  <dd>{detail.projectName}</dd>
                </div>
              ) : null}
              {detail.ipAddress ? (
                <div>
                  <dt className="text-muted-foreground">IP</dt>
                  <dd className="font-mono text-xs">{detail.ipAddress}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-6 space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Antes
                </p>
                <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px]">
                  {formatJson(detail.before)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Después
                </p>
                <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px]">
                  {formatJson(detail.after)}
                </pre>
              </div>
            </div>

            {entityHref ? (
              <Button variant="outline" size="sm" className="mt-4 w-fit" asChild>
                <Link href={entityHref}>Ver entidad</Link>
              </Button>
            ) : null}
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Registro no encontrado</SheetTitle>
            <SheetDescription>El registro solicitado no existe o no tenés acceso.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

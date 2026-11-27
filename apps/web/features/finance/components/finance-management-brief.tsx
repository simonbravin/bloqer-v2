"use client";

import Link from "next/link";
import { useState } from "react";
import type { FinanceHubOverview } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDbDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";

type Brief = FinanceHubOverview["managementBrief"];
type BriefSection = Brief["receivables"];
type BriefWindow = NonNullable<BriefSection["overdue"]>;

function WindowDetail({ data }: { data: BriefWindow }) {
  if (data.count === 0) return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Sin obligaciones con saldo pendiente en este grupo.</p>;
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md bg-muted/40 p-3">
      {data.totals.map((total) => <div key={total.currency} className="min-w-0">
        <p className="text-xs text-muted-foreground">Saldo pendiente · {total.currency}</p>
        <p className="break-words font-semibold tabular-nums">{formatMoneyAmount(total.amount, total.currency)}</p>
      </div>)}
    </div>
    <p className="text-xs text-muted-foreground">{data.count} obligaciones · Se muestran {data.items.length}, ordenadas por vencimiento. Los saldos incluyen todo el grupo.</p>
    <ul className="divide-y rounded-md border">
      {data.items.map((item) => <li key={item.id}>
        <Link href={item.href} className="block min-h-11 rounded-md p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 break-words font-medium text-primary">{item.contactName}</span>
            <span className="break-words font-medium tabular-nums">{formatMoneyAmount(item.balanceDue, item.currency)}</span>
          </div>
          <p className="mt-1 break-words text-xs text-muted-foreground">{item.companyName ?? "Empresa no informada"} · {item.projectName}</p>
          <p className="mt-1 text-xs text-muted-foreground">Comprobante n.º {item.documentNumber} · Vence {formatDbDate(item.dueDate)}</p>
          <span className="mt-2 inline-block text-xs font-medium text-primary">Ver obligación →</span>
        </Link>
      </li>)}
    </ul>
  </div>;
}

function ObligationSection({ title, data }: { title: string; data: BriefSection }) {
  const [window, setWindow] = useState<"overdue" | "upcoming">((data.overdue?.count ?? 0) > 0 ? "overdue" : "upcoming");
  return <Card role="region" aria-label={title} className="min-w-0">
    <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent>
      {!data.available || !data.overdue || !data.upcoming ? (
        <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">Esta fuente no está disponible para tu acceso o configuración. No se puede comprobar su saldo.</p>
      ) : <div className="min-w-0 space-y-3">
        <div role="group" aria-label={`Vencimientos ${title.toLowerCase()}`} className="grid w-full grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
          <Button type="button" variant={window === "overdue" ? "secondary" : "ghost"} aria-pressed={window === "overdue"} onClick={() => setWindow("overdue")} className="h-auto min-h-11 min-w-0 whitespace-normal">Vencidos ({data.overdue.count})</Button>
          <Button type="button" variant={window === "upcoming" ? "secondary" : "ghost"} aria-pressed={window === "upcoming"} onClick={() => setWindow("upcoming")} className="h-auto min-h-11 min-w-0 whitespace-normal">Hoy y próximos 7 días ({data.upcoming.count})</Button>
        </div>
        <WindowDetail data={window === "overdue" ? data.overdue : data.upcoming} />
      </div>}
    </CardContent>
  </Card>;
}

export function FinanceManagementBriefPanel({ brief }: { brief: Brief }) {
  return <section aria-labelledby="finance-management-brief-title" className="min-w-0 space-y-4">
    <div className="space-y-1">
      <h2 id="finance-management-brief-title" className="text-lg font-semibold tracking-tight">Resumen para decidir</h2>
      <p className="text-sm text-muted-foreground">
        {brief.companyId ? "Empresa activa" : "Organización · todas las empresas"} · Incluye obligaciones de empresa y de obras accesibles.
      </p>
      <p className="text-xs text-muted-foreground">Vencimientos al {formatDbDate(brief.asOfDate)} · Próximos hasta el {formatDbDate(brief.throughDate)} inclusive.</p>
    </div>
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <ObligationSection title="Por cobrar" data={brief.receivables} />
      <ObligationSection title="Por pagar" data={brief.payables} />
    </div>
    <p className="text-xs text-muted-foreground">Fuente: cuentas por cobrar y por pagar emitidas, con su saldo vigente después de pagos y créditos aplicados. Los importes se separan por moneda; no representan dinero ya cobrado o pagado. Abrí cada obligación para revisar el documento y continuar.</p>
  </section>;
}

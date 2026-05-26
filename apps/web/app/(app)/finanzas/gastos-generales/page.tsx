import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { getTenantModuleGate } from "@bloqer/services";

const MOVIMIENTOS_CORP =
  "/tesoreria/reportes/movimientos?sourceType=PAYMENT&type=OUTFLOW&corporateApPayments=true";

export default async function GastosGeneralesPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("AP") || !can(current.tenantCtx.roles, "VIEW", "AP")) {
    redirect("/finanzas");
  }

  const canEditAp = can(current.tenantCtx.roles, "EDIT", "AP");
  const canTreasury = gate.isEnabled("TREASURY") && can(current.tenantCtx.roles, "VIEW", "TREASURY");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gastos generales</h1>
          <p className="text-sm text-muted-foreground max-w-prose">
            Asistente para cargar <strong>facturas de proveedor sin proyecto</strong>, emitir la obligación (cuenta por pagar) y
            registrar el pago desde tesorería. Reutiliza el mismo flujo que Finanzas → facturas empresa; no agrega un
            libro paralelo.
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finanzas">← Resumen Finanzas</Link>
        </Button>
      </div>

      <ol className="list-decimal space-y-6 pl-5 text-sm leading-relaxed">
        <li>
          <span className="font-medium text-foreground">Crear borrador</span> — proveedor, líneas, fechas e IVA. Podés
          adjuntar comprobantes en el detalle luego del alta.
        </li>
        <li>
          <span className="font-medium text-foreground">Emitir factura</span> — genera la cuenta por pagar corporativa.
        </li>
        <li>
          <span className="font-medium text-foreground">Pagar</span> — desde cuentas por pagar de empresa elegís cuenta de tesorería y
          confirmás el pago (movimiento <code className="rounded bg-muted px-1">PAYMENT</code>).
        </li>
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Empezar</CardTitle>
          <CardDescription>
            {canEditAp
              ? "Creá el borrador; después emití y pagá desde las pantallas enlazadas."
              : "Tenés permiso de lectura (VIEW AP) pero no de edición: pedí EDIT AP para cargar facturas."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canEditAp ? (
            <Button asChild>
              <Link href="/finanzas/gastos-generales/nueva">Nueva factura de gasto</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/finanzas/facturas-proveedor">Ver facturas empresa</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/finanzas/cuentas-por-pagar">Pagos pendientes</Link>
          </Button>
        </CardContent>
        {canTreasury ? (
          <CardFooter className="border-t bg-muted/20">
            <Button asChild variant="secondary" size="sm">
              <Link href={MOVIMIENTOS_CORP}>Ver movimientos de tesorería (pagos corporativos)</Link>
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth";
import { listInternalTransfers } from "@bloqer/services";
import { cancelInternalTransferAction } from "../actions";
import { formatDate } from "@/lib/format";

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(parseFloat(value)) +
    " " +
    currency
  );
}

export default async function TransferenciasPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const transfers = await listInternalTransfers(ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tesoreria">← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Transferencias internas</h1>
        </div>
        <Button asChild>
          <Link href="/tesoreria/transferencias/nueva">+ Nueva transferencia</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Historial de transferencias</h2>
        </div>
        <div className="p-6">
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin transferencias registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => {
                  const doCancel = async () => {
                    "use server";
                    await cancelInternalTransferAction(t.id);
                  };
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{formatDate(t.transferDate)}</TableCell>
                      <TableCell className="text-sm">{t.sourceAccountName}</TableCell>
                      <TableCell className="text-sm">{t.destinationAccountName}</TableCell>
                      <TableCell className="text-sm">{t.currency}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtMoney(t.amount, t.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.status === "CONFIRMED" ? "default" : "secondary"}>
                          {t.status === "CONFIRMED" ? "Confirmada" : "Cancelada"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.status === "CONFIRMED" && (
                          <form action={doCancel}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                            >
                              Cancelar
                            </Button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}

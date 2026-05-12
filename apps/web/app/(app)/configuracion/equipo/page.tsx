import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canEditTeamMembership,
  canReadTenantConfigArea,
  listTenantInvitations,
  listTenantMembers,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function membershipStatusLabel(s: string) {
  return s === "ACTIVE" ? "Activo" : "Inactivo";
}

export default async function ConfiguracionEquipoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const rows = await listTenantMembers(ctx);
  const invitations = await listTenantInvitations(ctx);
  const pendingInvitations = invitations.filter((i) => i.status === "PENDING");
  const canInvite = canEditTeamMembership(current.tenantCtx.roles);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipo</h1>
          <p className="text-sm text-muted-foreground">Miembros del tenant y roles asignados.</p>
        </div>
        {canInvite ? (
          <Button asChild>
            <Link href="/configuracion/equipo/invitar">Invitar usuario</Link>
          </Button>
        ) : null}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sin miembros.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.membershipId}>
                  <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>{membershipStatusLabel(r.status)}</TableCell>
                  <TableCell className="text-xs">{r.roles.join(", ")}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.createdAt.toLocaleDateString("es-AR")}
                  </TableCell>
                  <TableCell>
                    <Button variant="link" className="h-auto p-0" asChild>
                      <Link href={`/configuracion/equipo/${r.membershipId}`}>Detalle</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pendingInvitations.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">Invitaciones pendientes</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell className="text-xs">{inv.roles.join(", ")}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {inv.expiresAt.toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell>
                      <Button variant="link" className="h-auto p-0" asChild>
                        <Link href={`/configuracion/equipo/invitaciones/${inv.id}`}>Detalle</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

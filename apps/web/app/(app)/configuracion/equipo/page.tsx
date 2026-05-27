import { formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canEditTeamMembership,
  canReadTenantConfigArea,
  listTenantInvitations,
  listTenantMembers,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { TableScroll } from "@/components/ui/table-scroll";
import { TeamMemberListSection } from "@/features/tenant-config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Equipo"
        subtitle={`${rows.length} ${rows.length === 1 ? "miembro" : "miembros"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey="equipo" />
            </Suspense>
            {canInvite ? (
              <Button asChild>
                <Link href="/configuracion/equipo/invitar">Invitar usuario</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <TeamMemberListSection members={rows} />
      </Suspense>

      {pendingInvitations.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">Invitaciones pendientes</h2>
          <TableScroll className="border-0">
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
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(inv.expiresAt)}
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
          </TableScroll>
        </div>
      ) : null}
    </PageShell>
  );
}

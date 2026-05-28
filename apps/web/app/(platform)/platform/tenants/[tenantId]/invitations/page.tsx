import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { listPlatformTenantInvitations, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PageProps {
  params: Promise<{ tenantId: string }>;
}

function invitationStatusLabel(s: string) {
  switch (s) {
    case "PENDING":
      return "Pendiente";
    case "ACCEPTED":
      return "Aceptada";
    case "CANCELLED":
      return "Cancelada";
    case "EXPIRED":
      return "Vencida";
    default:
      return s;
  }
}

export default async function PlatformTenantInvitationsPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const ctx = await getPlatformServiceContext(session.user.id);
  let rows;
  try {
    rows = await listPlatformTenantInvitations(tenantId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invitaciones</h1>
          <p className="text-sm text-muted-foreground">Enlaces pendientes y historial reciente.</p>
        </div>
        <Button asChild size="sm">
          <Link href={`/platform/tenants/${tenantId}/invitations/new`}>Invitar usuario</Link>
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Sin invitaciones.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell className="text-xs">{inv.roles.join(", ")}</TableCell>
                  <TableCell>{invitationStatusLabel(inv.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(inv.expiresAt)}
                  </TableCell>
                  <TableCell>
                    <Button variant="link" className="h-auto p-0" asChild>
                      <Link href={`/platform/tenants/${tenantId}/invitations/${inv.id}`}>Ver</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}

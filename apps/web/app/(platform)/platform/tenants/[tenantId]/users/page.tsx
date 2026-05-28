import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { listPlatformTenantUsers, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
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

export default async function PlatformTenantUsersPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const ctx = await getPlatformServiceContext(session.user.id);
  let rows;
  try {
    rows = await listPlatformTenantUsers(tenantId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const hasOwner = rows.some(
    (r) => r.membershipStatus === "ACTIVE" && r.roles.includes("OWNER"),
  );

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Membresías activas e inactivas del tenant.</p>
        </div>
        <Button asChild size="sm">
          <Link href={`/platform/tenants/${tenantId}/invitations/new`}>
            {hasOwner ? "Invitar usuario" : "Invitar OWNER"}
          </Link>
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Membresía</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Sin usuarios.{" "}
                  <Link
                    href={`/platform/tenants/${tenantId}/invitations/new`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Enviar invitación
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.membershipId}>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>{r.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.roles.join(", ")}</TableCell>
                  <TableCell>{r.membershipStatus}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}

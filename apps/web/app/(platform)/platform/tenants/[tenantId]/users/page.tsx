import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { listPlatformTenantUsers, ServiceError } from "@bloqer/services";
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/platform/tenants/${tenantId}`}>← Tenant</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Usuarios del tenant</h1>
      <div className="rounded-md border">
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
            {rows.map((r) => (
              <TableRow key={r.membershipId}>
                <TableCell>{r.email}</TableCell>
                <TableCell>{r.name ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.roles.join(", ")}</TableCell>
                <TableCell>{r.membershipStatus}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

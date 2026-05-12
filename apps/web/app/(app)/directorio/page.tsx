import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ContactTable } from "@/features/directory/components/contact-table";
import { ContactFilters } from "@/features/directory/components/contact-filters";
import { getCurrentUser } from "@/lib/auth";
import { listContacts } from "@bloqer/services";
import { redirect } from "next/navigation";
import type { ContactRoleType } from "@bloqer/database";

interface PageProps {
  searchParams: Promise<{ role?: string; status?: string; search?: string; page?: string }>;
}

const PAGE_SIZE = 20;
const VALID_ROLES = ["CLIENT", "SUPPLIER", "SUBCONTRACTOR", "EMPLOYEE", "OTHER"] as const;

export default async function DirectorioPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const role = VALID_ROLES.includes(sp.role as ContactRoleType) ? (sp.role as ContactRoleType) : undefined;
  const status = sp.status === "ARCHIVED" ? "ARCHIVED" as const : sp.status === "ALL" ? undefined : "ACTIVE" as const;
  const page = Math.max(1, Number(sp.page ?? 1));

  const { data, total } = await listContacts({ role, status, search: sp.search, page, pageSize: PAGE_SIZE }, ctx);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Directorio</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "contacto" : "contactos"}
          </p>
        </div>
        <Button asChild>
          <Link href="/directorio/nuevo">+ Nuevo contacto</Link>
        </Button>
      </div>

      <ContactFilters />
      <ContactTable contacts={data} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}

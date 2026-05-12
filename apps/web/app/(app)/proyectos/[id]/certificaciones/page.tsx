import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CertificationList } from "@/features/certifications";
import { getCurrentUser } from "@/lib/auth";
import { listCertificationsByProject, getProjectById, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CertificacionesPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectById(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const certs = await listCertificationsByProject(id, ctx);

  const serialized = certs.map((c) => ({
    id: c.id,
    projectId: id,
    code: c.code,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    status: c.status,
    totalAmount: c.totalAmount,
    currency: c.currency,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}`}>← {project.name}</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Certificaciones</h1>
        </div>
        <Button asChild>
          <Link href={`/proyectos/${id}/certificaciones/nueva`}>Nueva certificación</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Historial ({serialized.length})</h2>
        </div>
        <div className="px-6 py-4">
          <CertificationList certifications={serialized} projectId={id} />
        </div>
      </div>
    </div>
  );
}

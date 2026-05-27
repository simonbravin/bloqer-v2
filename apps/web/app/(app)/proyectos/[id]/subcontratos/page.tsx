import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listSubcontractsByProject, ServiceError } from "@bloqer/services";
import { SubcontractListSection } from "@/features/subcontracts/components/subcontract-list-section";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SubcontratosPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let subcontracts;
  try {
    subcontracts = await listSubcontractsByProject(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Subcontratos"
        subtitle={`${subcontracts.length} ${subcontracts.length === 1 ? "subcontrato" : "subcontratos"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`subcontratos-${projectId}`} />
            </Suspense>
            <Button asChild>
              <Link href={`/proyectos/${projectId}/subcontratos/nuevo`}>+ Nuevo subcontrato</Link>
            </Button>
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <SubcontractListSection subcontracts={subcontracts} projectId={projectId} />
      </Suspense>
    </PageShell>
  );
}

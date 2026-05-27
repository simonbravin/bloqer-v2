import type { ReactNode } from "react";
import { PageBackLink } from "@/components/layout/page-back-link";
import { PageListHeader } from "@/components/ui/page-list-header";

/** Encabezado estándar en módulos dentro de un proyecto. */
export function ProjectPageHeader({
  projectId,
  projectName,
  title,
  subtitle,
  actions,
}: {
  projectId: string;
  projectName: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <PageBackLink href={`/proyectos/${projectId}`} label={projectName} />
      <PageListHeader title={title} subtitle={subtitle} actions={actions} />
    </div>
  );
}

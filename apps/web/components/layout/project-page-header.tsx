import type { ReactNode } from "react";
import { PageListHeader } from "@/components/ui/page-list-header";

/** Encabezado estándar en módulos dentro de un proyecto. */
export function ProjectPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return <PageListHeader title={title} subtitle={subtitle} actions={actions} />;
}

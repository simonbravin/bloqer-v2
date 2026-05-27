import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string; budgetId: string }>;
}

/** Redirige a la sección de configuración en el editor WBS. */
export default async function EditarPresupuestoPage({ params }: PageProps) {
  const { id: projectId, budgetId } = await params;
  redirect(`/proyectos/${projectId}/presupuestos/${budgetId}#configuracion`);
}

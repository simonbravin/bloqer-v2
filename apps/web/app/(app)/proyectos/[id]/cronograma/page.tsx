import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProyectoCronogramaPage({ params }: PageProps) {
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}`}>← {project.name}</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">En diseño</CardTitle>
          <CardDescription>
            La vista de Gantt y el calendario de obra están previstos en el roadmap; la forma exacta (Gantt, hitos o
            ambos) está abierta en la documentación del producto como Q-003.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">WBS y materiales en presupuesto:</strong> el árbol de ítems y líneas de
            costo se edita en cada versión de presupuesto desde{" "}
            <Link className="text-primary underline-offset-4 hover:underline" href={`/proyectos/${projectId}/presupuestos`}>
              Presupuesto
            </Link>
            .
          </p>
          <p>
            <strong className="text-foreground">Seguimiento por ítem en obra:</strong> usá{" "}
            <Link className="text-primary underline-offset-4 hover:underline" href={`/proyectos/${projectId}/control-costos`}>
              WBS y costos
            </Link>{" "}
            para ver desvíos y drill-down por nodo del presupuesto aprobado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

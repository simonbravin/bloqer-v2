import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/features/projects";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectById,
  ServiceError,
  canViewProjectCashFlowReport,
  canViewProjectCostControlReport,
} from "@bloqer/services";
import {
  activateProjectAction,
  pauseProjectAction,
  resumeProjectAction,
  completeProjectAction,
  cancelProjectAction,
} from "../actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

const TYPE_LABELS = { PUBLIC: "Público", PRIVATE: "Privado" };

function fmt(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export default async function ProyectoDetailPage({ params }: PageProps) {
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

  const { client } = project;

  const roles = current.tenantCtx.roles;
  const showProjectCashFlow = canViewProjectCashFlowReport(roles);
  const showCostControl     = canViewProjectCostControlReport(roles);

  const doActivate = async () => { "use server"; await activateProjectAction(id); };
  const doPause    = async () => { "use server"; await pauseProjectAction(id); };
  const doResume   = async () => { "use server"; await resumeProjectAction(id); };
  const doComplete = async () => { "use server"; await completeProjectAction(id); };
  const doCancel   = async () => { "use server"; await cancelProjectAction(id); };

  const isTerminal = project.status === "COMPLETED" || project.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/proyectos">← Volver</Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-sm text-muted-foreground font-mono">{project.code}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/presupuestos`}>Presupuestos</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/certificaciones`}>Certificaciones</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/facturas`}>Facturas</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/cuentas-por-cobrar`}>C×C</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/cobranzas`}>Cobranzas</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/subcontratos`}>Subcontratos</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/libro-obra`}>Libro de obra</Link>
          </Button>
          {showCostControl && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${id}/control-costos`}>Control de costos</Link>
            </Button>
          )}
          {showProjectCashFlow && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${id}/flujo-caja`}>Flujo de caja</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/documentos`}>Documentos</Link>
          </Button>
          {!isTerminal && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${id}/editar`}>Editar</Link>
            </Button>
          )}
          {project.status === "DRAFT" && (
            <form action={doActivate}>
              <Button size="sm">Activar</Button>
            </form>
          )}
          {project.status === "ACTIVE" && (
            <>
              <form action={doPause}>
                <Button variant="outline" size="sm">Pausar</Button>
              </form>
              <form action={doComplete}>
                <Button variant="outline" size="sm">Completar</Button>
              </form>
            </>
          )}
          {project.status === "ON_HOLD" && (
            <form action={doResume}>
              <Button size="sm">Reanudar</Button>
            </form>
          )}
          {!isTerminal && (
            <form action={doCancel}>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Cancelar proyecto
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Datos del proyecto</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="font-medium">
              {client ? (
                <Link href={`/directorio/${client.id}`} className="underline underline-offset-2">
                  {client.fantasyName ?? client.legalName}
                </Link>
              ) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd className="font-medium">{TYPE_LABELS[project.type]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Inicio</dt>
            <dd className="font-medium">{fmt(project.startDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fin estimado</dt>
            <dd className="font-medium">{fmt(project.expectedEndDate)}</dd>
          </div>
          {project.actualEndDate && (
            <div>
              <dt className="text-muted-foreground">Fin real</dt>
              <dd className="font-medium">{fmt(project.actualEndDate)}</dd>
            </div>
          )}
          <div className="col-span-2">
            <dt className="text-muted-foreground">Dirección</dt>
            <dd className="font-medium">
              {[project.address, project.city, project.province].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          {project.description && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Descripción</dt>
              <dd className="whitespace-pre-wrap font-medium">{project.description}</dd>
            </div>
          )}
          {project.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap font-medium">{project.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

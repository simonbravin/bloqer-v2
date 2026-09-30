import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { getCertificationById, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string; certId: string }>;
}

/** El encabezado se edita en un diálogo del detalle. Esta ruta queda para enlaces viejos. */
export default async function EditarCertificacionPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, certId } = await params;
  const detail = `/proyectos/${projectId}/certificaciones/${certId}`;
  if (!can(current.tenantCtx.roles, "EDIT", "CERTIFICATIONS")) {
    redirect(detail);
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let cert;
  try {
    cert = await getCertificationById(certId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  if (cert.projectId !== projectId) notFound();
  if (cert.status !== "DRAFT") redirect(detail);
  redirect(`${detail}?editar=1`);
}

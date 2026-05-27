import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getSubcontractById,
  getSubcontractFormWbsPickList,
  listSubcontractorContacts,
  ServiceError,
} from "@bloqer/services";
import { SubcontractForm } from "@/features/subcontracts";
import { updateSubcontractAction } from "../../actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  params: Promise<{ id: string; subcontractId: string }>;
}

export default async function EditarSubcontratoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let subcontract;
  try {
    subcontract = await getSubcontractById(subcontractId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (subcontract.status !== "DRAFT")
    redirect(`/proyectos/${projectId}/subcontratos/${subcontractId}`);

  let wbsPick: Awaited<ReturnType<typeof getSubcontractFormWbsPickList>>;
  try {
    wbsPick = await getSubcontractFormWbsPickList(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const subcontractorOptions = await listSubcontractorContacts(projectId, ctx);

  const action = async (fd: FormData) => {
    "use server";
    return updateSubcontractAction(subcontractId, fd);
  };

  const companyId = subcontract.companyId ?? current.tenantCtx.companyId ?? "";

  return (
    <PageShell variant="detail" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink
          href={`/proyectos/${projectId}/subcontratos/${subcontractId}`}
          label="Subcontrato"
        />
        <h1 className="text-2xl font-bold tracking-tight">Editar subcontrato</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <SubcontractForm
          projectId={projectId}
          companyId={companyId}
          subcontractorOptions={subcontractorOptions}
          wbsOptions={wbsPick.wbsOptions}
          action={action}
          submitLabel="Guardar cambios"
          defaultValues={{
            subcontractorContactId: subcontract.subcontractorContactId,
            title: subcontract.title,
            description: subcontract.description ?? "",
            contractDate:
              subcontract.contractDate instanceof Date
                ? subcontract.contractDate.toISOString().split("T")[0]!
                : String(subcontract.contractDate).split("T")[0]!,
            startDate: subcontract.startDate
              ? subcontract.startDate instanceof Date
                ? subcontract.startDate.toISOString().split("T")[0]!
                : String(subcontract.startDate).split("T")[0]!
              : "",
            expectedEndDate: subcontract.expectedEndDate
              ? subcontract.expectedEndDate instanceof Date
                ? subcontract.expectedEndDate.toISOString().split("T")[0]!
                : String(subcontract.expectedEndDate).split("T")[0]!
              : "",
            currency: subcontract.currency,
            notes: subcontract.notes ?? "",
            internalNotes: subcontract.internalNotes ?? "",
            lines: subcontract.lines.map((l) => ({
              wbsNodeId: l.wbsNodeId ?? "__none__",
              description: l.description,
              unit: l.unit,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              notes: l.notes ?? "",
            })),
          }}
        />
      </div>
    </PageShell>
  );
}

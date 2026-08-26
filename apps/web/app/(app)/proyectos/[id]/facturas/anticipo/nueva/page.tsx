import { notFound, redirect } from "next/navigation";
import { AdvanceInvoiceForm } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditArArea,
  getProjectClientContactId,
  getProjectShellInfo,
  listAllContacts,
  listSelectableTreasuryAccounts,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { toContactPickerOption } from "@/lib/searchable-options";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevaAnticipoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  if (!canEditArArea(ctx.roles)) {
    redirect(`/proyectos/${projectId}/finanzas`);
  }

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let defaultClientId: string;
  try {
    defaultClientId = await getProjectClientContactId(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const [contacts, accounts] = await Promise.all([
    listAllContacts({ role: "CLIENT", status: "ACTIVE" }, ctx),
    listSelectableTreasuryAccounts(ctx),
  ]);

  const clients = contacts.map(toContactPickerOption);

  const treasuryAccounts = accounts
    .filter(
      (a) =>
        a.status === "ACTIVE" && (!ctx.companyId || !a.companyId || a.companyId === ctx.companyId),
    )
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Registrar anticipo de cliente</h1>
      </div>

      <AdvanceInvoiceForm
        projectId={projectId}
        clients={clients}
        accounts={treasuryAccounts}
        defaultClientId={defaultClientId}
      />
    </PageShell>
  );
}

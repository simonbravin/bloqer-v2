import { redirect } from "next/navigation";
import { TreasuryAccountForm } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function NuevaCuentaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href="/tesoreria/cuentas" label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva cuenta</h1>
      </div>

      <TreasuryAccountForm />
    </PageShell>
  );
}

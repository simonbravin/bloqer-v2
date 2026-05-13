import Link from "next/link";
import { redirect } from "next/navigation";
import { getFinanceHubOverview } from "@bloqer/services";
import { FinanceHubView } from "@/features/finance";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { Button } from "@/components/ui/button";

export default async function FinanzasPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const overview = await getFinanceHubOverview(ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
          <p className="text-sm text-muted-foreground">
            Resumen a nivel empresa. Los totales salen de los mismos servicios que el aging y la tesorería.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">← Inicio</Link>
        </Button>
      </div>

      <FinanceHubView overview={overview} />
    </div>
  );
}

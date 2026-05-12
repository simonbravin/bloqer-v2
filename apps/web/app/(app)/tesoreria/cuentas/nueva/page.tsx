import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TreasuryAccountForm } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";

export default async function NuevaCuentaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tesoreria/cuentas">← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nueva cuenta</h1>
      </div>

      <TreasuryAccountForm />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { ProductForm } from "@/features/inventory";

export default async function NuevoProductoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/inventario/productos">← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo producto</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ProductForm companyId={current.tenantCtx.companyId ?? undefined} />
      </div>
    </div>
  );
}

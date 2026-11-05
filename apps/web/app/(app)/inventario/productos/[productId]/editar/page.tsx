import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getProductById, ServiceError } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { ProductForm } from "@/features/inventory";

export default async function EditPage({ params }: { params: Promise<{ productId: string }> }) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const { productId } = await params;
  const ctx = { actorUserId: current.session.user.id!, ...current.tenantCtx };
  if (!can(ctx.roles, "EDIT", "INVENTORY")) redirect(`/inventario/productos/${productId}`);
  let product;
  try {
    product = await getProductById(productId, ctx);
  } catch (error) {
    if (error instanceof ServiceError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"))
      notFound();
    throw error;
  }
  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel="Editar">
      <h1 className="text-2xl font-bold tracking-tight">Editar producto</h1>
      <div className="rounded-lg border bg-card p-6">
        <ProductForm
          companyId={product.companyId ?? undefined}
          productId={productId}
          canEditUnit={product.canEditUnit}
          initialValues={{
            sku: product.sku,
            name: product.name,
            unit: product.unit,
            category: product.category,
            description: product.description,
            notes: product.notes,
          }}
        />
      </div>
    </PageShell>
  );
}

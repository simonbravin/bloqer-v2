import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canEditPurchaseRequests } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    productId?: string;
    from?: string;
  }>;
}

/** Legacy `/nueva` → list dialog (`?create=1`), preserving materiales prefill. */
export default async function NuevaSolicitudCompraPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canEditPurchaseRequests(current.tenantCtx.roles)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;
  const next = new URLSearchParams();
  next.set("create", "1");
  if (sp.wbsNodeId) next.set("wbsNodeId", sp.wbsNodeId);
  if (sp.description) next.set("description", sp.description);
  if (sp.quantity) next.set("quantity", sp.quantity);
  if (sp.productId) next.set("productId", sp.productId);
  if (sp.from) next.set("from", sp.from);

  redirect(`/proyectos/${id}/solicitudes-compra?${next.toString()}`);
}

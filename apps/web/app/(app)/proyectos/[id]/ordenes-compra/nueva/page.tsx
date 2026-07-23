import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canEditPurchaseOrders } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Legacy `/nueva` → list dialog (`?create=1`). */
export default async function NuevaOrdenCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canEditPurchaseOrders(current.tenantCtx.roles)) redirect("/dashboard");

  const { id } = await params;
  redirect(`/proyectos/${id}/ordenes-compra?create=1`);
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

/** Legacy `/nueva` → list dialog (`?create=1`). */
export default async function NuevaFacturaProveedorPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  if (!can(current.tenantCtx.roles, "EDIT", "AP")) {
    redirect(`/proyectos/${id}/facturas-proveedor`);
  }

  const next = new URLSearchParams({ create: "1" });
  if (sp.error) next.set("error", sp.error);
  redirect(`/proyectos/${id}/facturas-proveedor?${next.toString()}`);
}

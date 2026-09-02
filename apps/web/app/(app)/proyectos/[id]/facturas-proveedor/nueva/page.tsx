import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; wbsNodeId?: string; description?: string; quantity?: string; costAnalysisLineId?: string; unit?: string; costType?: string; from?: string }>;
}

/** Legacy `/nueva` → list dialog (`?create=1`) preserving APU prefill. */
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
  for (const key of [
    "wbsNodeId",
    "description",
    "quantity",
    "costAnalysisLineId",
    "unit",
    "costType",
    "from",
  ] as const) {
    const v = sp[key];
    if (v) next.set(key, v);
  }
  redirect(`/proyectos/${id}/facturas-proveedor?${next.toString()}`);
}

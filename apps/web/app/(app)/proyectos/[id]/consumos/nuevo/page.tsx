import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Legacy `/nuevo` → list dialog (`?create=1`). */
export default async function NuevoConsumoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  if (!can(current.tenantCtx.roles, "EDIT", "INVENTORY")) {
    redirect(`/proyectos/${id}/consumos`);
  }
  redirect(`/proyectos/${id}/consumos?create=1`);
}

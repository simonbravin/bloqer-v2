import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canRegisterApPayment } from "@bloqer/services";

interface PageProps {
  params: Promise<{ payableId: string }>;
}

/** Legacy `/pagar` → detail dialog (`?pagar=1`). Blocked states are explained on the detail page. */
export default async function FinanzasPagarPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { payableId } = await params;
  const detailHref = `/finanzas/cuentas-por-pagar/${payableId}`;

  if (!canRegisterApPayment(current.tenantCtx.roles)) {
    redirect(detailHref);
  }

  redirect(`${detailHref}?pagar=1`);
}

import { redirect } from "next/navigation";

/**
 * Legacy global ledger route.
 * Extracto canónico = detalle de cuenta (`/tesoreria/cuentas/[id]`).
 */
export default async function MovimientosRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const sp = await searchParams;
  const accountId = sp.accountId?.trim();
  if (accountId) {
    redirect(`/tesoreria/cuentas/${accountId}`);
  }
  redirect("/tesoreria/cuentas");
}

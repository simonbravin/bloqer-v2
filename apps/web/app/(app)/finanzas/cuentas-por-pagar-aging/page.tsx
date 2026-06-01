import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

/** Legado: aging unificado en /finanzas/cuentas-por-pagar. */
export default async function ApAgingRedirectPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value) q.set(key, value);
  }
  q.set("scope", "corporate");
  const query = q.toString();
  redirect(`/finanzas/cuentas-por-pagar${query ? `?${query}` : ""}`);
}

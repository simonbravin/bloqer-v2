import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

/** Legado: aging unificado en /finanzas/cuentas-por-cobrar. */
export default async function ArAgingRedirectPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value) q.set(key, value);
  }
  const query = q.toString();
  redirect(`/finanzas/cuentas-por-cobrar${query ? `?${query}` : ""}`);
}

import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Legacy route — absorbed into EDT y costos ([D-098]). Also covered by next.config redirect. */
export default async function PresupuestoVsRealRedirectPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string" && value) q.set(key, value);
  }
  const qs = q.toString();
  redirect(`/proyectos/${id}/control-costos${qs ? `?${qs}` : ""}`);
}

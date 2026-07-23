import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Legacy report route → materiales tab varianza. */
export default async function ReporteMaterialesRedirect({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams();
  q.set("tab", "varianza");
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
  }
  redirect(`/proyectos/${id}/materiales?${q.toString()}`);
}

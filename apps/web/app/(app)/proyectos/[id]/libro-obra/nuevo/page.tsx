import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Legacy route → list dialog (`?create=1`). */
export default async function NuevoParteObraRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/proyectos/${id}/libro-obra?create=1`);
}

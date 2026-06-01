import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Legacy route — uploads now use the dialog on the documents list. */
export default async function NuevoDocumentoPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/proyectos/${id}/documentos`);
}

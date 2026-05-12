import { redirect } from "next/navigation";

interface PageProps { params: Promise<{ id: string; subcontractId: string }> }

export default async function CertificacionesIndexPage({ params }: PageProps) {
  const { id, subcontractId } = await params;
  redirect(`/proyectos/${id}/subcontratos/${subcontractId}`);
}

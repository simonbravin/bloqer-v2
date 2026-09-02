import { ResourceBoardPage } from "@/features/resources";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    window?: string;
    budgetId?: string;
    dateFrom?: string;
    dateTo?: string;
    wbsNodeId?: string;
  }>;
}

export default async function ProyectoEquiposPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  return <ResourceBoardPage costCategory="EQUIPMENT" projectId={id} searchParams={sp} />;
}

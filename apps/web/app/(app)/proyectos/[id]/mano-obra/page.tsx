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

export default async function ProyectoManoObraPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  return <ResourceBoardPage costCategory="LABOR" projectId={id} searchParams={sp} />;
}

import { notFound, redirect } from "next/navigation";
import { getProjectDocumentDeliveryIndex, ServiceError, type DocumentDeliveryParams } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS, DocumentCategoryBadge } from "@/features/documents/components/document-category-badge";
import { DocumentProvenance } from "@/features/documents/components/document-provenance";
import { DocumentStatusBadge } from "@/features/documents/components/document-status-badge";
import { ReportExportActions } from "@/features/reports/report-export-actions";
import { getCurrentUser } from "@/lib/auth";

export default async function DocumentDeliveryIndexPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx || !current.session.user?.id) redirect("/login");
  const { id } = await params;
  const raw = await searchParams;
  const filters: DocumentDeliveryParams = {};
  for (const key of ["search", "status", "category", "page"] as const) {
    if (typeof raw[key] === "string") filters[key] = raw[key];
  }
  let data;
  try {
    data = await getProjectDocumentDeliveryIndex(id, filters, {
      actorUserId: current.session.user.id, ...current.tenantCtx,
    });
  } catch (error) {
    if (error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code)) notFound();
    if (error instanceof ServiceError) return <PageShell variant="default">
      <ProjectPageHeader title="Índice de entrega" />
      <p role="alert" className="rounded-lg border bg-card p-4">{error.message}</p>
      <Button asChild variant="outline" className="min-h-11"><a href={`/proyectos/${id}/documentos/indice-entrega`}>Limpiar filtros</a></Button>
    </PageShell>;
    throw error;
  }
  const exportParams = { search: data.filters.search, status: data.filters.status, category: data.filters.category };
  const pageHref = (page: number) => `/proyectos/${id}/documentos/indice-entrega?${new URLSearchParams({ ...exportParams, page: String(page) })}`;
  return <PageShell variant="default" className="space-y-5">
    <ProjectPageHeader title="Índice de entrega" subtitle={`${data.projectCode} · ${data.projectName}`} actions={<>
      <Button asChild variant="outline" className="min-h-11"><a href={`/proyectos/${id}/documentos`}>Volver a documentos</a></Button>
      <div className="[&_button]:min-h-11"><ReportExportActions exportPath={`/api/reports/proyectos/${id}/documentos/indice-entrega/export`} params={exportParams} pdf xlsx /></div>
    </>} />
    <div className="rounded-lg border bg-card p-4 text-sm">
      <p className="font-medium">{data.total} archivos · {data.originalsRegistered} con original registrado · {data.total - data.originalsRegistered} sin original registrado</p>
      <p className="mt-2 text-muted-foreground">Incluye los documentos que podés consultar con los filtros elegidos. Exportar incluye todas sus páginas. Para comprobar un original, abrí el archivo y su historial.</p>
      <p className="mt-1 text-muted-foreground">El índice reúne la documentación registrada; los requisitos de entrega y garantías se revisan con el cliente.</p>
    </div>
    <form method="get" className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
      <div className="min-w-0 space-y-1"><Label htmlFor="delivery-search">Buscar archivo o descripción</Label><Input id="delivery-search" name="search" defaultValue={data.filters.search} maxLength={200} className="min-h-11" /></div>
      <div className="space-y-1"><Label htmlFor="delivery-status">Estado</Label><select id="delivery-status" name="status" defaultValue={data.filters.status} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="ACTIVE">Activos</option><option value="ARCHIVED">Archivados</option><option value="ALL">Activos y archivados</option></select></div>
      <div className="space-y-1"><Label htmlFor="delivery-category">Categoría</Label><select id="delivery-category" name="category" defaultValue={data.filters.category} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Todas</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="flex flex-wrap items-end gap-2"><Button type="submit" className="min-h-11">Aplicar filtros</Button><Button asChild variant="ghost" className="min-h-11"><a href={`/proyectos/${id}/documentos/indice-entrega`}>Limpiar</a></Button></div>
    </form>
    <ol className="divide-y rounded-lg border bg-card" aria-label="Índice documental">
      {data.rows.map((row) => <li key={row.id} data-testid="delivery-document" className="grid gap-3 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <a href={row.href} className="inline-flex min-h-11 items-center break-all font-medium text-primary underline-offset-4 hover:underline">{row.fileName}</a>
          <div className="flex flex-wrap items-center gap-2"><DocumentCategoryBadge category={row.category} /><DocumentStatusBadge status={row.status} /><span className="text-xs text-muted-foreground">{row.originalRegistered ? "Original registrado" : "Sin original registrado"}</span></div>
          <DocumentProvenance doc={row} />
        </div>
        <div className="min-w-0 text-sm">
          <p className="font-medium">Revisiones</p>
          {row.previous ? <a href={`/proyectos/${id}/documentos/${row.previous.id}`} className="flex min-h-11 items-center break-all text-primary underline-offset-4 hover:underline">Anterior: {row.previous.fileName}</a> : null}
          {row.next ? <a href={`/proyectos/${id}/documentos/${row.next.id}`} className="flex min-h-11 items-center break-all text-primary underline-offset-4 hover:underline">Siguiente: {row.next.fileName}</a> : null}
          {!row.previous && !row.next ? <p className="mt-1 text-muted-foreground">Sin revisiones vinculadas visibles</p> : null}
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:justify-end">
          <Button asChild variant="outline" className="min-h-11"><a href={row.href}>Abrir archivo</a></Button>
          {row.originalRegistered ? <Button asChild variant="outline" className="min-h-11"><a href={`/api/documents/${row.id}/download?disposition=attachment`}>Descargar original</a></Button> : null}
        </div>
      </li>)}
      {!data.rows.length ? <li className="p-6 text-sm text-muted-foreground">No hay documentos para los filtros seleccionados.</li> : null}
    </ol>
    <nav aria-label="Páginas del índice" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>Página {data.page} de {data.pages} · {data.total} archivos</p>
      <div className="flex gap-2">{data.page > 1 ? <Button asChild variant="outline" className="min-h-11"><a href={pageHref(data.page - 1)}>Anterior</a></Button> : null}{data.page < data.pages ? <Button asChild variant="outline" className="min-h-11"><a href={pageHref(data.page + 1)}>Siguiente</a></Button> : null}</div>
    </nav>
  </PageShell>;
}

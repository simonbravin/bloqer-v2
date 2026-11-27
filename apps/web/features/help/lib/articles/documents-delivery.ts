import type { HelpArticle } from "../types";

export const DOCUMENT_DELIVERY_ARTICLES: HelpArticle[] = [{
  slug: "preparar-indice-de-entrega",
  title: "Preparar el índice documental de entrega de obra",
  summary: "Reuní los archivos registrados, sus responsables y revisiones, y exportá el índice completo en CSV, Excel o PDF.",
  intents: ["documentos-obra", "exportar-reportes"],
  modules: ["general", "proyectos"],
  level: "project",
  typicalRoles: ["PM", "Administración"],
  permissionHint: "El índice respeta el acceso a la empresa, la obra y el módulo al que pertenece cada adjunto.",
  where: { menu: "Operación → Documentos → Índice de entrega" },
  hrefs: [{ kind: "project", suffix: "/documentos/indice-entrega", label: "Índice de entrega" }],
  steps: [
    "Desde Documentos, abrí Índice de entrega.",
    "Buscá por archivo o descripción y elegí categoría y estado: Activos, Archivados o Activos y archivados. Aplicar filtros vuelve a la primera página.",
    "Revisá el responsable, la fecha y hora de registro, y las revisiones anteriores o siguientes visibles. Abrir archivo permite consultar el detalle y su historial.",
    "Original registrado indica que hubo una carga confirmada. Para comprobar que los bytes sigan accesibles, abrí Historial → Verificar archivo guardado.",
    "Exportar descarga CSV, Excel o PDF con todos los archivos de los filtros, aunque estés viendo una página intermedia. La vista muestra 25 por página.",
    "Descargar original usa el archivo existente y vuelve a comprobar el acceso.",
  ],
  effects: ["Genera una consulta o un índice descargable; no cambia estados, revisiones ni documentos de la obra."],
  pitfalls: [
    "Los archivos sin original registrado conservan sus metadatos, pero no pueden descargarse. Las cargas sin confirmar y los archivos eliminados no se incluyen.",
    "El índice incluye solo documentación visible para tu usuario. No acredita que estén completos los requisitos contractuales ni las garantías; revisalos con el cliente.",
    "El archivo exportado contiene el índice, no los originales ni un backup. Las rutas de CSV/Excel requieren iniciar sesión en Bloqer.",
    "Si supera 10.000 archivos, acotá la búsqueda o categoría. No se genera un archivo parcial.",
  ],
  relatedSlugs: ["ver-y-descargar-documento", "organizar-carpetas-de-documentos", "exportar-reportes-csv-pdf"],
  keywords: ["índice de entrega", "dossier", "cierre de obra", "documentación final", "garantías", "original registrado", "revisiones", "autor", "fecha y hora", "exportar documentos", "Excel", "PDF"],
  guideRef: "§8.4",
}];

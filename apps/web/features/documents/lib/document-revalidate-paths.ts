/** Paths that must refresh after archive / restore / delete of a project document. */
export function documentRevalidatePaths(params: {
  projectId: string;
  documentId: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
}): string[] {
  const { projectId, documentId, linkedEntityType, linkedEntityId } = params;
  const paths = [
    `/proyectos/${projectId}/documentos`,
    `/proyectos/${projectId}/documentos/${documentId}`,
  ];
  if (!linkedEntityId || !linkedEntityType || linkedEntityType === "PROJECT") {
    return paths;
  }
  switch (linkedEntityType) {
    case "JOBSITE_LOG":
      paths.push(`/proyectos/${projectId}/libro-obra/${linkedEntityId}`);
      break;
    case "CERTIFICATION":
      paths.push(`/proyectos/${projectId}/certificaciones/${linkedEntityId}`);
      break;
    case "SUPPLIER_INVOICE":
      paths.push(`/proyectos/${projectId}/facturas-proveedor/${linkedEntityId}`);
      break;
    case "SALES_INVOICE":
      paths.push(`/proyectos/${projectId}/facturas/${linkedEntityId}`);
      break;
    case "PURCHASE_ORDER":
      paths.push(`/proyectos/${projectId}/ordenes-compra/${linkedEntityId}`);
      break;
    case "PURCHASE_RECEIPT":
      paths.push(`/proyectos/${projectId}/recepciones/${linkedEntityId}`);
      break;
    case "PURCHASE_REQUEST":
    case "PROCUREMENT_QUOTE":
      paths.push(`/proyectos/${projectId}/solicitudes-compra`);
      if (linkedEntityType === "PURCHASE_REQUEST") {
        paths.push(`/proyectos/${projectId}/solicitudes-compra/${linkedEntityId}`);
      }
      break;
    case "SUBCONTRACT":
      paths.push(`/proyectos/${projectId}/subcontratos/${linkedEntityId}`);
      break;
    case "SUBCONTRACT_CERTIFICATION":
      paths.push(`/proyectos/${projectId}/subcontratos`);
      break;
    case "BUDGET":
      paths.push(`/proyectos/${projectId}/presupuestos/${linkedEntityId}`);
      break;
    default:
      break;
  }
  return paths;
}

import { revalidatePath } from "next/cache";
import { revalidateProjectCostAndFinancePaths } from "@/lib/revalidate-project-paths";

/** Procurement changes also affect coverage, linked documents and pending work. */
export function revalidateProcurementPaths(projectId: string): void {
  revalidateProjectCostAndFinancePaths(projectId);
  revalidatePath("/dashboard");
  revalidatePath("/pendientes");
  for (const area of ["pendientes", "solicitudes-compra", "ordenes-compra", "recepciones", "mano-obra", "equipos", "cronograma", "inventario"]) {
    revalidatePath(`/proyectos/${projectId}/${area}`);
  }
  for (const detail of ["solicitudes-compra/[prId]", "solicitudes-compra/[prId]/editar", "ordenes-compra/[poId]", "ordenes-compra/[poId]/editar", "recepciones/[receiptId]"]) {
    revalidatePath(`/proyectos/${projectId}/${detail}`, "page");
  }
}

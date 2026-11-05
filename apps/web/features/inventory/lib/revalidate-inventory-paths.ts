import { revalidatePath } from "next/cache";
import { revalidateProjectCostAndFinancePaths } from "@/lib/revalidate-project-paths";

/** Stock, names and status are consumed by all of these existing inventory views. */
export function revalidateInventoryPaths(projectId?: string | null) {
  revalidatePath("/inventario", "layout");
  if (projectId) {
    revalidatePath(`/proyectos/${projectId}/inventario`);
    revalidateProjectCostAndFinancePaths(projectId);
  } else {
    for (const area of [
      "inventario",
      "consumos",
      "materiales",
      "ordenes-compra",
      "solicitudes-compra",
      "recepciones",
    ]) {
      revalidatePath(`/proyectos/[id]/${area}`, "page");
    }
  }
}

import { revalidatePath } from "next/cache";

/**
 * Paths that show derived project finance / cost KPIs.
 * Call after cash, AP/AR, procurement, cert, or inventory mutations.
 */
export function revalidateProjectCostAndFinancePaths(projectId: string): void {
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath(`/proyectos/${projectId}/finanzas`);
  revalidatePath(`/proyectos/${projectId}/flujo-caja`);
  revalidatePath(`/proyectos/${projectId}/control-costos`);
  revalidatePath(`/proyectos/${projectId}/materiales`);
  revalidatePath(`/proyectos/${projectId}/consumos`);
  revalidatePath(`/proyectos/${projectId}/compras`);
  revalidatePath(`/proyectos/${projectId}/reportes`);
  revalidatePath(`/proyectos/${projectId}/reportes/ingresos-gastos`);
  revalidatePath(`/proyectos/${projectId}/reportes/rentabilidad`);
  revalidatePath(`/proyectos/${projectId}/reportes/caja`);
  revalidatePath(`/proyectos/${projectId}/reportes/presupuesto-vs-real`);
}

/** Cash movements also hit company treasury surfaces. */
export function revalidateTreasuryPaths(): void {
  revalidatePath("/tesoreria");
  revalidatePath("/finanzas/transacciones");
  revalidatePath("/finanzas/cuentas-por-pagar");
  revalidatePath("/finanzas/cuentas-por-cobrar");
  revalidatePath("/finanzas/pagos-proveedor");
  revalidatePath("/finanzas/cobranzas");
}

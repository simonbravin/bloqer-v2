import { redirect } from "next/navigation";

/** Legado: alta de factura corporativa vive en Facturas y gastos. */
export default function GastosGeneralesNuevaRedirectPage() {
  redirect("/finanzas/facturas-proveedor/nueva");
}

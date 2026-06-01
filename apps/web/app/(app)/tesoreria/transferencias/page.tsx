import { redirect } from "next/navigation";

/** Listado unificado en movimientos con filtro de transferencias internas. */
export default function TransferenciasPage() {
  redirect("/tesoreria/reportes/movimientos?sourceType=INTERNAL_TRANSFER");
}

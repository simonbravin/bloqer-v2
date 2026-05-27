import { cn } from "@/lib/utils";

/**
 * Contenedor estándar para tablas de listados y reportes.
 * Mismo estilo que subcontratos: borde redondeado + scroll horizontal en pantallas chicas.
 */
export function TableScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-lg border bg-card", className)}>
      {children}
    </div>
  );
}

import Link from "next/link";

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex flex-wrap gap-4 border-b border-border pb-3 text-sm font-medium">
        <Link href="/configuracion" className="text-muted-foreground hover:text-foreground">
          Resumen
        </Link>
        <Link href="/configuracion/equipo" className="text-muted-foreground hover:text-foreground">
          Equipo
        </Link>
        <Link href="/configuracion/permisos" className="text-muted-foreground hover:text-foreground">
          Permisos
        </Link>
      </nav>
      {children}
    </div>
  );
}

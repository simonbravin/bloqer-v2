import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Sin datos sintéticos de avance: solo invitación al reporte existente. */
export function ProjectOverviewCostCtaCard({ href }: { href: string }) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Presupuesto vs ejecutado</CardTitle>
        <CardDescription>
          El detalle comparativo vive en control de costos. No mostramos barras estimadas sin el reporte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="secondary" size="sm">
          <Link href={href}>Abrir control de costos</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

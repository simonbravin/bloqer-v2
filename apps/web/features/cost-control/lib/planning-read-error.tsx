import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { ServiceError } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Render documented read failures; unexpected errors remain sanitized by the app boundary. */
export function planningReadError(error: unknown, resetHref: string) {
  if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
  if (error instanceof ServiceError && error.code === "FORBIDDEN") redirect("/dashboard");
  const message = error instanceof ServiceError && (error.code === "VALIDATION" || error.code === "CONFLICT")
    ? error.message
    : error instanceof ZodError ? "Revisá los filtros elegidos para esta vista." : null;
  if (message == null) throw error;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">No se puede mostrar esta vista</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p role="alert" className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" asChild><Link href={resetHref}>Restablecer filtros</Link></Button>
      </CardContent>
    </Card>
  );
}

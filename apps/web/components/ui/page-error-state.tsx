"use client";

import Link from "next/link";
import { Button } from "./button";

export function PageErrorState({ onRetry, standalone = false, homeHref = "/dashboard" }: {
  onRetry: () => void;
  standalone?: boolean;
  homeHref?: "/dashboard" | "/platform";
}) {
  const content = (
    <div className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">No pudimos cargar esta página</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        Volvé a cargar el contenido. Si el problema continúa, comunicate con el administrador.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onRetry}>Volver a cargar</Button>
        <Button variant="outline" asChild><Link href={homeHref}>Ir al inicio</Link></Button>
      </div>
    </div>
  );
  return standalone ? (
    <main className="flex min-h-[100svh] items-center justify-center bg-workspace p-4 text-workspace-foreground">
      {content}
    </main>
  ) : <div className="shell-page flex justify-center py-8">{content}</div>;
}

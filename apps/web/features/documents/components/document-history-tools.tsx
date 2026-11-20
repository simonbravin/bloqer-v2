"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export function DocumentHistoryTools({ documentId, canVerifyFile }: { documentId: string; canVerifyFile: boolean }) {
  const [pending, setPending] = useState<"export" | "integrity" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ checksumVerified: boolean; checkedAt: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function run(kind: "export" | "integrity") {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(kind);
    setError(null);
    setResult(null);
    try {
      const suffix = kind === "export" ? "history/export" : "integrity";
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/${suffix}`, { cache: "no-store", signal: controller.signal });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        const body = type.includes("application/json") ? await response.json() as { error?: string } : null;
        throw new Error(body?.error ?? "No se pudo completar la consulta. Revisá tu acceso e intentá de nuevo.");
      }
      if (kind === "export") {
        if (!type.includes("text/csv")) throw new Error("Tu sesión venció. Volvé a iniciar sesión para exportar.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `historial-${documentId}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        if (!type.includes("application/json")) throw new Error("Tu sesión venció. Volvé a iniciar sesión para verificar.");
        const verified = await response.json() as { checksumVerified: boolean; checkedAt: string };
        if (!controller.signal.aborted) setResult(verified);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo completar la consulta.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => void run("export")}>Exportar historial CSV</Button>
        {canVerifyFile ? <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => void run("integrity")}>Verificar archivo guardado</Button> : null}
      </div>
      {pending ? <p role="status" className="text-xs text-muted-foreground">{pending === "export" ? "Preparando historial completo…" : "Leyendo y verificando el archivo guardado…"}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {result ? <p role="status" className="text-xs text-muted-foreground">
        {result.checksumVerified ? "Archivo accesible: tamaño y contenido coinciden con la huella registrada." : "Archivo accesible: tamaño coincidente. Este registro no tiene huella original para comparar el contenido."}
        {" "}Verificado el {formatDateTime(result.checkedAt)}. Esta comprobación no crea una copia de seguridad.
      </p> : null}
    </div>
  );
}

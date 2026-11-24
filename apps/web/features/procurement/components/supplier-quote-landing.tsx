"use client";

import { useEffect, useRef, useState } from "react";
import type { SupplierQuoteRequestSnapshot } from "@bloqer/validators";
import { Button } from "@/components/ui/button";
import { SupplierQuoteResponseForm } from "./supplier-quote-response-form";

type LinkState = { state: "open"; snapshot: SupplierQuoteRequestSnapshot; expiresAt: string } | { state: "sent" };
export function SupplierQuoteLanding({ invitationId, enabled }: { invitationId: string; enabled: boolean }) {
  const started = useRef(false);
  const token = useRef<string | null>(null);
  const [state, setState] = useState<LinkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setError(null);
    try {
      if (!enabled) throw new Error("El enlace no está disponible. Pedí un nuevo enlace a Compras.");
      const response = token.current
        ? await fetch(`/cotizar/${invitationId}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current }), cache: "no-store" })
        : await fetch(`/cotizar/${invitationId}/response`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      token.current = null; setState(result);
    } catch (err) { setError(err instanceof Error ? err.message : "No pudimos abrir el enlace. Intentá de nuevo."); }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get("token");
    // Remove the bearer fragment before any HTTP exchange; no browser storage.
    window.history.replaceState(null, "", window.location.pathname);
    void load();
    // The invitation ID cannot change within this isolated landing page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (error) return <div className="space-y-4 rounded-lg border p-5"><p role="alert" className="text-sm">{error}</p>{enabled && <Button variant="outline" onClick={() => void load()}>Reintentar</Button>}</div>;
  if (!state) return <p role="status" className="text-sm text-muted-foreground">Comprobando enlace…</p>;
  if (state.state === "sent") return <div role="status" className="space-y-2 rounded-lg border bg-muted/30 p-6"><h2 className="text-xl font-semibold">Respuesta recibida</h2><p className="text-sm text-muted-foreground">Compras revisará tu cotización. Para modificarla, pedí un nuevo enlace. Ya podés cerrar esta página.</p></div>;
  return <div className="space-y-5"><p className="text-sm text-muted-foreground">El enlace vence el {new Date(state.expiresAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.</p>
    <SupplierQuoteResponseForm snapshot={state.snapshot} onSubmit={async response => {
      const result = await fetch(`/cotizar/${invitationId}/response`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(response), cache: "no-store" });
      const body = await result.json();
      if (!result.ok) return { error: body.error ?? "No pudimos guardar la respuesta." };
      setState({ state: "sent" }); return {};
    }} />
  </div>;
}

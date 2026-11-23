"use client";

import { useEffect, useRef, useState } from "react";
import type { PurchaseRequestAudioProposal } from "@bloqer/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";

type Props = {
  projectId: string;
  onApply: (proposal: PurchaseRequestAudioProposal) => void;
  onCancel: () => void;
  onPendingChange?: (pending: boolean) => void;
};
const MAX_BYTES = 3 * 1024 * 1024;

export function PurchaseRequestAudioAssistant({ projectId, onApply, onCancel, onPendingChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [proposal, setProposal] = useState<PurchaseRequestAudioProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const busyRef = useRef(false);

  function markBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
    pendingCallback.current?.(value);
  }

  function stopMedia() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  useEffect(() => () => {
    generation.current += 1;
    request.current?.abort();
    stopMedia();
    pendingCallback.current?.(false);
  }, []);

  useEffect(() => {
    if (!file) { setAudioUrl(null); return; }
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(next: File | null) {
    generation.current += 1;
    request.current?.abort();
    setError(null);
    setTranscript(""); setReviewed(false); setProposal(null);
    if (next && (!next.size || next.size > MAX_BYTES || !["audio/webm", "audio/mp4", "audio/wav"].includes(next.type.split(";")[0]!))) {
      setFile(null); setError("Elegí audio WebM, MP4 o WAV de hasta 3 MiB."); return;
    }
    setFile(next);
  }

  async function startRecording() {
    if (busyRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador no permite grabar. Elegí un archivo o escribí el pedido."); return;
    }
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((mime) => MediaRecorder.isTypeSupported(mime));
    if (!mimeType) { setError("No hay un formato de grabación compatible. Elegí un archivo o escribí el pedido."); return; }
    chooseFile(null);
    const token = generation.current;
    markBusy(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation.current !== token) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const current = new MediaRecorder(media, { mimeType });
      recorder.current = current;
      const chunks: BlobPart[] = [];
      let size = 0;
      current.ondataavailable = (event) => {
        size += event.data.size;
        if (size <= MAX_BYTES) chunks.push(event.data);
        else stopMedia();
      };
      current.onstop = () => {
        stopMedia();
        if (generation.current !== token) return;
        setRecording(false); markBusy(false);
        if (size > MAX_BYTES || !size) { setError("La grabación está vacía o supera 3 MiB. Volvé a grabar un pedido más corto."); return; }
        const type = mimeType.split(";")[0]!;
        setFile(new File(chunks, type === "audio/mp4" ? "pedido.mp4" : "pedido.webm", { type }));
      };
      current.onerror = () => {
        if (generation.current === token) {
          generation.current += 1;
          setRecording(false); markBusy(false);
          setError("No se pudo grabar. Podés elegir un archivo o escribir el pedido.");
        }
        stopMedia();
      };
      current.start(1000); setRecording(true);
      timer.current = setTimeout(stopMedia, 60_000);
    } catch {
      stopMedia();
      if (generation.current === token) { markBusy(false); setError("No se pudo acceder al micrófono. Podés elegir un archivo o escribir el pedido."); }
    }
  }

  async function run(kind: "transcribe" | "prepare") {
    if (busyRef.current || (kind === "transcribe" ? !file : !reviewed || !transcript.trim())) return;
    const token = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    markBusy(true); setError(null); setProposal(null);
    try {
      const form = new FormData();
      if (kind === "transcribe") { form.set("projectId", projectId); form.set("file", file!); setReviewed(false); }
      const response = await fetch("/api/ai/purchase-request-audio", {
        method: "POST", signal: controller.signal,
        ...(kind === "transcribe" ? { body: form } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, transcript }) }),
      });
      const data = await response.json();
      if (generation.current !== token) return;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo procesar el pedido.");
      if (kind === "transcribe") {
        if (typeof data.transcript !== "string" || !data.transcript.trim() || data.transcript.length > 8000) throw new Error("No se obtuvo una transcripción válida.");
        setTranscript(data.transcript);
      } else {
        if (!data.proposal || !Array.isArray(data.proposal.lines) || !data.proposal.lines.length) throw new Error("No se obtuvo una propuesta válida.");
        setProposal(data.proposal as PurchaseRequestAudioProposal);
      }
    } catch (err) {
      if (generation.current === token && !controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo procesar el pedido.");
    } finally { if (generation.current === token) markBusy(false); }
  }

  function cancelWork() {
    generation.current += 1; request.current?.abort(); stopMedia(); setRecording(false); markBusy(false);
  }

  return <section className="space-y-4 rounded-lg border p-4" aria-label="Preparar solicitud por audio">
    <h3 className="font-semibold">Dictar solicitud de compra</h3>
    <p className="text-sm text-muted-foreground">Grabá hasta 60 segundos, elegí audio WebM/MP4/WAV de hasta 3 MiB o escribí el pedido. Al transcribir, el audio se envía al proveedor de IA configurado. Bloqer no guarda el audio ni la transcripción.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy && !recording} onClick={() => recording ? stopMedia() : void startRecording()}>{recording ? "Detener grabación" : "Grabar pedido"}</Button>
      {busy ? <Button type="button" variant="outline" onClick={cancelWork}>Cancelar procesamiento</Button> : null}
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Continuar manualmente</Button>
    </div>
    <div className="space-y-2">
      <Label htmlFor="request-audio-file">Audio del pedido</Label>
      <Input id="request-audio-file" type="file" accept="audio/webm,audio/mp4,audio/wav" disabled={busy} onChange={(event) => { chooseFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
      {file ? <p className="break-words text-sm">{file.name}</p> : null}
      {audioUrl ? <audio controls src={audioUrl} className="w-full" aria-label="Escuchar pedido" /> : null}
      <Button type="button" disabled={busy || !file} onClick={() => void run("transcribe")}>{busy && !recording ? "Procesando…" : "Transcribir audio"}</Button>
    </div>
    <div className="space-y-2">
      <Label htmlFor="request-transcript">Revisá el texto del pedido</Label>
      <AutoGrowTextarea id="request-transcript" maxLength={8000} value={transcript} disabled={busy} onChange={(event) => { setTranscript(event.target.value); setReviewed(false); setProposal(null); }} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} disabled={busy || !transcript.trim()} onChange={(event) => setReviewed(event.target.checked)} />Revisé el texto: refleja mi pedido.</label>
      <Button type="button" disabled={busy || !reviewed || !transcript.trim()} onClick={() => void run("prepare")}>Preparar renglones</Button>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {proposal ? <div className="space-y-3">
      <h4 className="font-medium">Propuesta para revisar</h4>
      <ul className="space-y-2 text-sm">{proposal.lines.map((line, index) => <li key={index} className="break-words">{line.description ?? "Descripción pendiente"} · {line.quantity ?? "Cantidad pendiente"} · {line.unit ?? "Unidad pendiente"}</li>)}</ul>
      <p className="text-sm">Fecha requerida: {proposal.neededByDate ?? "Elegir en el formulario"}</p>
      {proposal.observations ? <p className="whitespace-pre-wrap break-words text-sm">{proposal.observations}</p> : null}
      <p className="text-sm text-muted-foreground">Al usar la propuesta se reemplazan los renglones, la fecha y las observaciones del formulario. Elegí la partida, completá faltantes y revisá todo antes de guardar. Todavía no se guarda ni se envía a Compras.</p>
      <Button type="button" disabled={busy || !reviewed} onClick={() => onApply(proposal)}>Usar propuesta y completar</Button>
    </div> : null}
  </section>;
}

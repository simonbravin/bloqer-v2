"use client";

import * as React from "react";
import type { ManualReportType } from "@bloqer/validators";
import { sendReportEmailAction } from "@/app/(app)/report-email-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SearchParamsLike = Record<string, string | string[] | undefined>;

function flattenParams(p: SearchParamsLike): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, raw] of Object.entries(p)) {
    if (k === "format") continue;
    if (raw === undefined || raw === "") continue;
    if (Array.isArray(raw)) {
      const v = raw[0];
      if (v) o[k] = v;
    } else {
      o[k] = raw;
    }
  }
  return o;
}

export type ReportEmailSendDialogProps = {
  reportType: ManualReportType;
  supportsPdf: boolean;
  params: SearchParamsLike;
  projectId?: string;
  defaultRecipientEmail?: string | null;
};

export function ReportEmailSendDialog(props: ReportEmailSendDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [recipient, setRecipient] = React.useState(props.defaultRecipientEmail ?? "");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [format, setFormat] = React.useState<"csv" | "pdf">("csv");
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setRecipient(props.defaultRecipientEmail ?? "");
      setSubject("");
      setMessage("");
      setFormat("csv");
      setFeedback(null);
    }
  }, [open, props.defaultRecipientEmail]);

  React.useEffect(() => {
    if (!props.supportsPdf && format === "pdf") setFormat("csv");
  }, [props.supportsPdf, format]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFeedback(null);
    const payload = {
      reportType: props.reportType,
      format,
      recipientEmail: recipient.trim(),
      subject: subject.trim() || undefined,
      message: message.trim() || undefined,
      params: flattenParams(props.params),
      projectId: props.projectId,
    };
    const r = await sendReportEmailAction(payload);
    setPending(false);
    if (!r.success) {
      setFeedback(r.error);
      return;
    }
    const d = r.data;
    if (d.skippedReason === "email_not_configured") {
      setFeedback(
        `Correo no configurado (Resend): el reporte se generó correctamente (${d.filename}) pero no se envió. Configurá RESEND_API_KEY y RESEND_FROM_EMAIL para envío real.`,
      );
      return;
    }
    if (!d.ok) {
      setFeedback(d.error ?? "Error al enviar");
      return;
    }
    setFeedback(`Enviado a ${d.recipientEmail} · adjunto ${d.filename}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Enviar por email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Enviar reporte por email</DialogTitle>
            <DialogDescription>
              Se adjunta el mismo archivo que en exportación (CSV o PDF). El tenant se toma de tu sesión.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label htmlFor="report-email-to">Destinatario</Label>
              <Input
                id="report-email-to"
                type="email"
                required
                autoComplete="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Formato</Label>
              <Select
                value={format}
                onValueChange={(v) => {
                  if (v === "csv") setFormat("csv");
                  else if (v === "pdf" && props.supportsPdf) setFormat("pdf");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  {props.supportsPdf ? <SelectItem value="pdf">PDF</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="report-email-subject">Asunto (opcional)</Label>
              <Input
                id="report-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Por defecto: Bloqer — nombre del reporte"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="report-email-msg">Mensaje (opcional)</Label>
              <Textarea
                id="report-email-msg"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Texto breve en el cuerpo del correo"
              />
            </div>
            {feedback ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{feedback}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Enviar reporte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

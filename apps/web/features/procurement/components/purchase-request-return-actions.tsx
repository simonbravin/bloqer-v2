"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { returnPurchaseRequestAction } from "@/app/(app)/proyectos/[id]/solicitudes-compra/actions";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import {
  procurementActionBtnClass,
  procurementDialogBtnClass,
} from "../lib/procurement-ui";

type Props = {
  prId: string;
  projectId: string;
};

/** Devolver SC SUBMITTED → DRAFT when no quotes/OC ([BR-PUR-025]). */
export function PurchaseRequestReturnActions({ prId, projectId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function returnPr() {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError("El motivo es obligatorio.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await returnPurchaseRequestAction(prId, projectId, trimmed);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setReturnOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={procurementActionBtnClass}
        data-testid="purchase-request-return-button"
        disabled={pending}
        onClick={() => setReturnOpen(true)}
      >
        Devolver a borrador
      </Button>

      <Sheet
        open={returnOpen}
        onOpenChange={(open) => {
          setReturnOpen(open);
          if (!open) {
            setReason("");
            setError(null);
          }
        }}
      >
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="text-left">
            <SheetTitle>Devolver a borrador</SheetTitle>
            <SheetDescription>
              Solo si aún no hay cotizaciones ni órdenes. Indicá el motivo (obligatorio). Después
              podés corregir cantidades y volver a enviar.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <ActionErrorBanner message={error ?? undefined} />
            <Label htmlFor="pr-return-reason">Motivo</Label>
            <Textarea
              id="pr-return-reason"
              data-testid="purchase-request-return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              rows={5}
              className="min-h-32 w-full"
              placeholder="Ej.: corregir cantidades de hierro…"
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className={procurementDialogBtnClass}
                disabled={pending}
                onClick={() => setReturnOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className={procurementDialogBtnClass}
                data-testid="purchase-request-return-confirm"
                disabled={pending}
                onClick={returnPr}
              >
                {pending ? "Devolviendo…" : "Devolver a borrador"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

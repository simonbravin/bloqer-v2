"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSearch, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PurchaseOrderInvoiceDraftPreview } from "@bloqer/services";
import type { SupplierInvoiceDocumentPreview } from "@bloqer/ai";
import { requiresArInvoiceLetter, suggestInvoiceLetter, defaultTaxRateForInvoiceLetter, isZeroIvaRate, type InvoiceLetterCode, type IvaConditionCode, invoiceLetterHint, DEFAULT_IIBB_PERCEPTION_RATE_PCT } from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportInvalidDecimalInputs } from "@/components/ui/decimal-input";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, SEARCHABLE_NONE, toSearchableOptions } from "@/lib/searchable-options";
import { formatMoneyAmount } from "@/lib/format-money";
import { InvoiceLinesEditor } from "./invoice-lines-editor";
import type { InvoiceLine, InvoiceWbsOption } from "./invoice-lines-editor";
import { DocumentUploadZone } from "@/features/documents/components/document-upload-zone";
import { clientUploadDocument } from "@/features/documents/lib/client-upload-document";
import { InvoiceLetterSelect, PricesIncludeTaxCheckbox } from "@/features/finance/components/invoice-letter-fields";
import { ExpandableNotesField } from "@/features/finance/components/expandable-notes-field";
import { SettlementFields } from "@/features/treasury/components/settlement-fields";
import type { SettlementMethodValue } from "@/features/treasury/lib/settlement-method-label";
import {
  createSupplierInvoiceAction,
  getPurchaseOrderInvoiceDraftPreviewAction,
  registerProjectApExpenseAction,
} from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import { createCompanySupplierInvoiceAction } from "@/app/(app)/finanzas/facturas-proveedor/actions";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { classifySupplierInvoice } from "@bloqer/domain";
import { DocumentClassCreateHint } from "@/features/finance/components/document-class-badge";
import { cn } from "@/lib/utils";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { SupplierInvoiceDocumentAssistant } from "./supplier-invoice-document-assistant";
import { mapSupplierInvoiceDocumentPrefill } from "../lib/supplier-invoice-document-prefill";
import { submitSupplierInvoiceDraft } from "../lib/supplier-invoice-draft-submission";
import { getSupplierInvoiceDocumentReview } from "../lib/supplier-invoice-document-review";

export type SupplierOption = {
  id: string;
  label: string;
  country?: string;
  ivaCondition?: string | null;
  searchValue?: string;
};
export type POOption = { id: string; code: string; supplierContactId: string; currency: string };
export type TreasuryAccountOption = { id: string; label: string; currency: string };

interface Props {
  /** Required when `companyFinanzas` is false */
  projectId?: string;
  companyFinanzas?: boolean;
  suppliers: SupplierOption[];
  companyCountry?: string | null;
  companyIvaCondition?: string | null;
  poOptions?: POOption[];
  /** Project WBS items for line imputation ([D-055]). */
  wbsOptions?: InvoiceWbsOption[];
  /** Active treasury accounts for “pay now” (project only). */
  treasuryAccounts?: TreasuryAccountOption[];
  /** Show pay-now when user can register AP payments ([D-069]). */
  canPayNow?: boolean;
  /** Storage ready for optional attachment on create. */
  storageConfigured?: boolean;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  /** Prefill from Mano de obra / Equipos boards ([D-099] / [D-110]). */
  initialLine?: {
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    unit?: string;
    costType?: string;
    costAnalysisLineId?: string;
  };
}

const DEFAULT_LINE: InvoiceLine = {
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "21",
  discountPct: "0",
  wbsNodeId: null,
  purchaseOrderLineId: null,
  costAnalysisLineId: null,
  costType: "MATERIAL",
};
const INVOICE_CURRENCY = "ARS";

function buildInitialLines(
  initialLine?: Props["initialLine"],
): InvoiceLine[] {
  if (
    !initialLine?.wbsNodeId &&
    !initialLine?.description &&
    !initialLine?.costType &&
    !initialLine?.costAnalysisLineId
  ) {
    return [{ ...DEFAULT_LINE }];
  }
  const costType =
    initialLine.costType === "LABOR" ||
    initialLine.costType === "EQUIPMENT" ||
    initialLine.costType === "MATERIAL" ||
    initialLine.costType === "SUBCONTRACT" ||
    initialLine.costType === "OTHER"
      ? initialLine.costType
      : "MATERIAL";
  return [
    {
      ...DEFAULT_LINE,
      description: initialLine.description ?? "",
      quantity: initialLine.quantity ?? "1",
      wbsNodeId: initialLine.wbsNodeId ?? null,
      costAnalysisLineId: initialLine.costAnalysisLineId ?? null,
      costType,
    },
  ];
}

export function SupplierInvoiceForm({
  projectId,
  companyFinanzas = false,
  suppliers,
  companyCountry = null,
  companyIvaCondition = null,
  poOptions = [],
  wbsOptions = [],
  treasuryAccounts = [],
  canPayNow = false,
  storageConfigured = false,
  variant = "card",
  onCancel,
  onSuccess,
  onPendingChange,
  initialLine,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { pending: isPending, run, isBusy } = useOperationalAction({ onError: setError, onPendingChange });
  const [previewPending, setPreviewPending] = useState(false);
  const [documentAvailable, setDocumentAvailable] = useState(false);
  const [entryMode, setEntryMode] = useState<"manual" | "document">("manual");
  const [appliedPreview, setAppliedPreview] = useState<SupplierInvoiceDocumentPreview | null>(null);
  const [priceBasisKnown, setPriceBasisKnown] = useState(true);
  const [reviewedSnapshot, setReviewedSnapshot] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [assistedDocument, setAssistedDocument] = useState<File | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [draftAttachmentError, setDraftAttachmentError] = useState<string | null>(null);
  const [draftResultUncertain, setDraftResultUncertain] = useState(false);
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [supplierContactId, setSupplierContactId] = useState("");
  const [invoiceLetter, setInvoiceLetter] = useState<InvoiceLetterCode | null>(null);
  const [letterTouched, setLetterTouched] = useState(false);
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [pricesIncludeTaxTouched, setPricesIncludeTaxTouched] = useState(false);
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(null);
  /** Project AP: explicit commitment vs direct cost ([D-102] / Phase 1). */
  const [apSpendMode, setApSpendMode] = useState<"AGAINST_PO" | "DIRECT">("DIRECT");
  const [lines, setLines] = useState<InvoiceLine[]>(() => buildInitialLines(initialLine));
  const [iibbPerceptionRate, setIibbPerceptionRate] = useState(DEFAULT_IIBB_PERCEPTION_RATE_PCT);
  const [payNow, setPayNow] = useState(false);
  const [payAccountId, setPayAccountId] = useState("");
  const [payMethod, setPayMethod] = useState<SettlementMethodValue | "">("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const { idempotencyKey: expenseKey, rotateIdempotencyKey: rotateExpenseKey } = useIdempotencyKey();
  const { idempotencyKey: payNowKey, rotateIdempotencyKey: rotatePayNowKey } = useIdempotencyKey();
  const { idempotencyKey: attachmentKey, rotateIdempotencyKey: rotateAttachmentKey } = useIdempotencyKey();
  const [poPreview, setPoPreview] = useState<PurchaseOrderInvoiceDraftPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!storageConfigured) return;
    const controller = new AbortController();
    void fetch("/api/ai/supplier-invoice-preview", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data: { enabled?: boolean } | null) => {
        if (!controller.signal.aborted) setDocumentAvailable(data?.enabled === true);
      }).catch(() => { /* Manual entry remains available. */ });
    return () => controller.abort();
  }, [storageConfigured]);

  useEffect(() => {
    if (!attachment || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(attachment.type)) {
      setOriginalUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  useEffect(() => { if (assistedDocument) completionRef.current?.focus(); }, [assistedDocument]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (draftAttachmentError || draftResultUncertain) outcomeRef.current?.focus();
  }, [draftAttachmentError, draftResultUncertain]);

  function handlePreviewBusyChange(pending: boolean) {
    setPreviewPending(pending);
    // Same synchronous dialog guard as mutations; the two operations cannot overlap.
    onPendingChange?.(pending);
  }

  useEffect(() => {
    rotateAttachmentKey();
  }, [attachment, rotateAttachmentKey]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierContactId),
    [suppliers, supplierContactId],
  );
  const showLetter = Boolean(assistedDocument) || requiresArInvoiceLetter(companyCountry, selectedSupplier?.country ?? null);

  useEffect(() => {
    if (!supplierContactId || letterTouched) return;
    // Compra: emisor = proveedor, receptor = empresa
    const suggested = suggestInvoiceLetter({
      issuerIvaCondition: (selectedSupplier?.ivaCondition as IvaConditionCode | null | undefined) ?? null,
      receiverIvaCondition: (companyIvaCondition as IvaConditionCode | null) ?? null,
      receiverCountry: companyCountry,
    });
    setInvoiceLetter(suggested);
    if (!suggested) return;
    const nextRate = defaultTaxRateForInvoiceLetter(suggested);
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        taxRate:
          suggested === "C" || suggested === "E"
            ? "0"
            : isZeroIvaRate(l.taxRate)
              ? nextRate
              : l.taxRate,
      })),
    );
  }, [supplierContactId, selectedSupplier, companyIvaCondition, companyCountry, letterTouched]);

  useEffect(() => {
    if (pricesIncludeTaxTouched) return;
    setPricesIncludeTax(invoiceLetter === "B");
  }, [invoiceLetter, pricesIncludeTaxTouched]);

  const supportsPoPreview = Boolean(projectId) && !companyFinanzas;

  // Trae el estado de facturación de la OC (3-way match) al seleccionarla.
  useEffect(() => {
    if (!supportsPoPreview || !projectId || !purchaseOrderId) {
      setPoPreview(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPoPreview(null);
    getPurchaseOrderInvoiceDraftPreviewAction(projectId, purchaseOrderId)
      .then((res) => {
        if (cancelled) return;
        setPoPreview("error" in res ? null : res);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo consultar la orden de compra. Volvé a seleccionarla para reintentar.");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supportsPoPreview, projectId, purchaseOrderId]);

  function bringPoLines() {
    if (!poPreview || poPreview.lines.length === 0) return;
    // OC lines are net ([D-086]); never treat them as gross after import.
    setPricesIncludeTaxTouched(true);
    setPricesIncludeTax(false);
    const forceZeroTax = invoiceLetter === "C" || invoiceLetter === "E";
    setIibbPerceptionRate(
      poPreview.iibbPerceptionRate?.trim()
        ? poPreview.iibbPerceptionRate
        : DEFAULT_IIBB_PERCEPTION_RATE_PCT,
    );
    setLines(
      poPreview.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: forceZeroTax ? "0" : l.taxRate,
        discountPct: l.discountPct ?? "0",
        wbsNodeId: l.wbsNodeId ?? null,
        purchaseOrderLineId: l.purchaseOrderLineId ?? null,
        costAnalysisLineId: l.costAnalysisLineId ?? null,
        costType: (l.costType as InvoiceLine["costType"]) ?? "MATERIAL",
      })),
    );
    toast.success("Líneas traídas desde la OC (pendiente de facturar). Podés ajustarlas.");
  }

  const filteredPOs = poOptions.filter(
    (po) => po.currency === INVOICE_CURRENCY && (!supplierContactId || po.supplierContactId === supplierContactId),
  );

  // Al cambiar de proveedor, descartar una OC vinculada que ya no le pertenece.
  useEffect(() => {
    if (purchaseOrderId && !filteredPOs.some((po) => po.id === purchaseOrderId)) {
      setPurchaseOrderId(null);
      setLines((prev) => prev.map((l) => ({ ...l, purchaseOrderLineId: null })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierContactId]);

  function onPurchaseOrderChange(nextId: string | null) {
    if (nextId === purchaseOrderId) return;
    setPurchaseOrderId(nextId);
    if (nextId) setApSpendMode("AGAINST_PO");
    // Drop OC-line FKs when unlinking or switching OC ([D-066]).
    setLines((prev) => prev.map((l) => ({ ...l, purchaseOrderLineId: null })));
  }

  function selectApSpendMode(mode: "AGAINST_PO" | "DIRECT") {
    setApSpendMode(mode);
    if (mode === "DIRECT") {
      setPurchaseOrderId(null);
      setLines((prev) => prev.map((l) => ({ ...l, purchaseOrderLineId: null })));
    }
  }

  const derivedClass = useMemo(() => {
    if (companyFinanzas || !projectId) {
      return classifySupplierInvoice({ projectId: null });
    }
    if (apSpendMode === "AGAINST_PO") {
      // Chip anticipa Compra comprometida aunque aún no haya OC elegida.
      return classifySupplierInvoice({
        projectId,
        purchaseOrderId,
        hasPoLineLink: true,
      });
    }
    return classifySupplierInvoice({
      projectId,
      purchaseOrderId: null,
      hasPoLineLink: false,
    });
  }, [companyFinanzas, projectId, apSpendMode, purchaseOrderId]);

  const classHint =
    companyFinanzas || !projectId ? "Gasto de estructura (sin obra)." : null;

  const poComboboxOptions = useMemo(
    () => toSearchableOptions(filteredPOs.map((po) => ({ id: po.id, label: po.code }))),
    [filteredPOs],
  );

  const compatibleAccounts = useMemo(
    () => treasuryAccounts.filter((a) => a.currency === INVOICE_CURRENCY),
    [treasuryAccounts],
  );
  const treasuryOptions = useMemo(
    () => toSearchableOptions(compatibleAccounts.map((a) => ({ id: a.id, label: a.label }))),
    [compatibleAccounts],
  );

  const showPayNow = Boolean(projectId) && !companyFinanzas && canPayNow && !assistedDocument;
  const invoiceListHref = companyFinanzas ? "/finanzas/facturas-proveedor" : `/proyectos/${projectId}/facturas-proveedor`;
  const showForm = entryMode === "manual" || Boolean(assistedDocument);
  const documentReview = getSupplierInvoiceDocumentReview({
    supplierContactId, invoiceLetter, requireLetter: showLetter, issueDate, dueDate,
    pricesIncludeTax: priceBasisKnown ? pricesIncludeTax : null,
    iibbPerceptionRate, lines, requireWbs: supportsPoPreview,
  });
  const currentReviewSnapshot = JSON.stringify({ supplierContactId, invoiceLetter, issueDate, dueDate, pricesIncludeTax, priceBasisKnown, iibbPerceptionRate, lines });
  const documentReviewed = reviewedSnapshot === currentReviewSnapshot;

  function focusCompletionTarget(target: string) {
    const element = formRef.current?.querySelector<HTMLElement>(`[id="${target}"]`);
    const control = element?.matches("input,button") ? element : element?.querySelector<HTMLElement>("input,button,[tabindex]");
    (control ?? element)?.focus();
  }

  function applyDocumentPreview(preview: SupplierInvoiceDocumentPreview, file: File) {
    if (isBusy() || savedDraftId || draftResultUncertain || purchaseOrderId || apSpendMode !== "DIRECT") return;
    const values = mapSupplierInvoiceDocumentPrefill(preview);
    if (!values) { setError("La propuesta requiere carga manual. Revisá los campos no identificados."); return; }
    setSupplierContactId("");
    setLetterTouched(true);
    setPricesIncludeTaxTouched(true);
    setInvoiceLetter(values.invoiceLetter);
    setIssueDate(values.issueDate);
    setDueDate(values.dueDate);
    setPriceBasisKnown(values.pricesIncludeTax !== null);
    setPricesIncludeTax(values.pricesIncludeTax ?? false);
    setIibbPerceptionRate(values.iibbPerceptionRate);
    setLines(values.lines);
    setPayNow(false);
    setAttachment(file);
    setAssistedDocument(file);
    setAppliedPreview(preview);
    setReviewedSnapshot(null);
    setError(null);
  }

  function openDraft(invoiceId: string) {
    onSuccess?.();
    router.push(`${invoiceListHref}/${invoiceId}`);
  }

  async function saveDraft(create: () => Promise<{ id: string } | { error: string }>) {
    const result = await submitSupplierInvoiceDraft({
      knownInvoiceId: savedDraftId, create, onCreated: setSavedDraftId,
      upload: (invoiceId) => uploadAttachmentIfAny(invoiceId, companyFinanzas ? null : projectId ?? null),
    });
    if (result.kind === "saved") {
      setDraftAttachmentError(null);
      toast.success(attachment ? "Borrador guardado con el comprobante adjunto." : "Borrador guardado.");
      openDraft(result.invoiceId);
    } else if (result.kind === "attachment_failed") {
      setDraftAttachmentError(result.error);
    } else {
      setError(result.error);
      if (result.kind === "uncertain") setDraftResultUncertain(true);
    }
  }

  async function uploadAttachmentIfAny(invoiceId: string, scopeProjectId: string | null) {
    if (!attachment || !storageConfigured) return null;
    return clientUploadDocument({
      file: attachment,
      projectId: scopeProjectId,
      category: "INVOICE",
      linkedEntityType: "SUPPLIER_INVOICE",
      linkedEntityId: invoiceId,
      idempotencyKey: attachmentKey,
    }).catch(() => ({ error: "Se perdió la conexión durante la subida" }));
  }

  function notifyAttachFailure(uploadError: string, paid: boolean) {
    toast.warning(
      paid
        ? `Factura emitida y pagada, pero no se pudo adjuntar el archivo: ${uploadError}. Podés reintentar desde el detalle.`
        : `Factura creada, pero no se pudo adjuntar el archivo: ${uploadError}. Podés reintentar desde el detalle.`,
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy() || previewPending || savedDraftId || draftResultUncertain || !showForm) return;
    setError(null);
    if (!reportInvalidDecimalInputs(e.currentTarget)) return;
    if (assistedDocument && (documentReview.pending.length || !documentReviewed)) {
      setError("Completá los datos pendientes y confirmá la revisión contra el original antes de guardar.");
      return;
    }
    if (assistedDocument && (!attachment || attachment !== assistedDocument || !storageConfigured)) {
      setError("Conservá el comprobante original para adjuntarlo al borrador.");
      return;
    }
    if (!supplierContactId) { setError("Debe seleccionar a quién se le paga"); return; }
    if (showLetter && !invoiceLetter) {
      setError("Seleccioná el comprobante (A, B, C o E)");
      return;
    }
    if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
      setError("Completar descripción, cantidad y precio en todas las líneas");
      return;
    }
    if (projectId && !companyFinanzas && lines.some((l) => !l.wbsNodeId)) {
      setError("Cada línea debe imputar a una partida EDT");
      return;
    }
    if (
      projectId &&
      !companyFinanzas &&
      apSpendMode === "AGAINST_PO" &&
      !purchaseOrderId
    ) {
      setError("Seleccioná la orden de compra o cambiá a costo directo");
      return;
    }
    if (payNow && showPayNow && !payAccountId) {
      setError("Seleccioná la cuenta de pago");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const letterPayload = showLetter ? invoiceLetter : null;
    const forceZeroTax = letterPayload === "C" || letterPayload === "E";
    const pricesIncludeTaxPayload = forceZeroTax ? false : pricesIncludeTax;
    void run(async () => {
      if (companyFinanzas) {
        await saveDraft(() => createCompanySupplierInvoiceAction({
          supplierContactId,
          issueDate:     fd.get("issueDate") as string,
          dueDate:       fd.get("dueDate") as string,
          currency:      INVOICE_CURRENCY,
          invoiceLetter: letterPayload,
          pricesIncludeTax: pricesIncludeTaxPayload,
          notes:         (fd.get("notes") as string) || null,
          internalNotes: null,
          iibbPerceptionRate,
          lines:         lines.map((l, i) => ({
            ...l,
            taxRate: forceZeroTax ? "0" : l.taxRate,
            sortOrder: i,
          })),
        }));
        return;
      }
      if (!projectId) {
        setError("Configuración inválida del formulario");
        return;
      }

      if (payNow && showPayNow) {
        const issueDate = fd.get("issueDate") as string;
        const paymentDate = (fd.get("paymentDate") as string) || issueDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
          setError("Fecha de pago inválida");
          return;
        }
        const res = await registerProjectApExpenseAction(projectId, {
          idempotencyKey: expenseKey,
          supplierContactId,
          issueDate,
          dueDate: fd.get("dueDate") as string,
          currency: INVOICE_CURRENCY,
          invoiceLetter: letterPayload,
          pricesIncludeTax: pricesIncludeTaxPayload,
          notes: (fd.get("notes") as string) || null,
          purchaseOrderId: apSpendMode === "AGAINST_PO" ? purchaseOrderId : null,
          iibbPerceptionRate,
          lines: lines.map((l, i) => ({
            ...l,
            taxRate: forceZeroTax ? "0" : l.taxRate,
            sortOrder: i,
            purchaseOrderLineId: apSpendMode === "DIRECT" ? null : l.purchaseOrderLineId,
          })),
          payNow: {
            accountId: payAccountId,
            paymentDate,
            payFullBalance: true,
            notes: null,
            paymentMethod: payMethod || null,
            reference: String(fd.get("reference") ?? "").trim() || null,
            idempotencyKey: payNowKey,
          },
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        const uploadRes = await uploadAttachmentIfAny(res.id, projectId);
        if (uploadRes && "error" in uploadRes) {
          notifyAttachFailure(uploadRes.error, true);
        }
        rotateExpenseKey();
        rotatePayNowKey();
        onSuccess?.();
        router.push(`/proyectos/${projectId}/facturas-proveedor/${res.id}`);
        return;
      }

      await saveDraft(() => createSupplierInvoiceAction(projectId, {
        projectId,
        supplierContactId,
        issueDate:       fd.get("issueDate")  as string,
        dueDate:         fd.get("dueDate")    as string,
        currency:        INVOICE_CURRENCY,
        invoiceLetter:   letterPayload,
        pricesIncludeTax: pricesIncludeTaxPayload,
        notes:           (fd.get("notes") as string) || null,
        internalNotes:   null,
        purchaseOrderId: apSpendMode === "AGAINST_PO" ? purchaseOrderId : null,
        iibbPerceptionRate,
        lines: lines.map((l, i) => ({
          ...l,
          taxRate: forceZeroTax ? "0" : l.taxRate,
          sortOrder: i,
          purchaseOrderLineId: apSpendMode === "DIRECT" ? null : l.purchaseOrderLineId,
        })),
      }));
    });
  }

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-5 sm:p-6" : undefined}>
      <form ref={formRef} onSubmit={handleSubmit} className="min-w-0 space-y-4">
        <fieldset disabled={isPending || Boolean(savedDraftId) || draftResultUncertain} aria-busy={isPending || previewPending} className="min-w-0 space-y-4">
        <p className="text-xs text-muted-foreground">Esta alta manual se registra en ARS.{supportsPoPreview ? " Para facturar una OC en otra moneda, abrí esa orden y usá su panel de facturación." : ""}</p>
        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {documentAvailable && !assistedDocument ? <div className="space-y-2">
          <p className="text-sm font-medium" id="invoice-entry-label">¿Cómo querés cargar la factura?</p>
          <div role="group" aria-labelledby="invoice-entry-label" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              ["manual", "Carga manual", "Completá los datos o traé las líneas de una OC.", PencilLine],
              ["document", "Desde un comprobante", "Subí una foto o PDF, revisá y completá la lectura.", FileSearch],
            ] as const).map(([mode, label, description, Icon]) => <button key={mode} type="button" aria-pressed={entryMode === mode}
              disabled={isPending || previewPending || (mode === "document" && apSpendMode === "AGAINST_PO")}
              onClick={() => { setEntryMode(mode); setError(null); }}
              className={cn("flex min-h-16 items-start gap-3 rounded-lg border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50", entryMode === mode ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40")}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
            </button>)}
          </div>
          {apSpendMode === "AGAINST_PO" ? <p className="text-xs text-muted-foreground">Para facturas contra una OC, usá las líneas de esa orden y adjuntá el comprobante.</p> : null}
        </div> : null}

        {storageConfigured && !assistedDocument && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{entryMode === "document" ? "1. Elegí el comprobante" : "Comprobante (opcional)"}</p>
            <p className="text-xs text-muted-foreground">{entryMode === "document" ? "PDF, JPEG, PNG o WebP, hasta 3 MiB. Desde el celular podés usar Tomar foto. Revisá que se vean todas las líneas y el total." : "Foto o PDF de la factura. Se adjunta después de guardar el borrador."}</p>
            <DocumentUploadZone selectedFile={attachment} onFileSelect={setAttachment} onValidationError={setError}
              fileInputAccept={entryMode === "document" ? ".pdf,.jpg,.jpeg,.png,.webp" : undefined}
              formatsHint={entryMode === "document" ? "Para lectura: PDF, JPEG, PNG o WebP · hasta 3 MiB" : undefined}
              disabled={isPending || previewPending || Boolean(assistedDocument) || Boolean(savedDraftId)} />
            {entryMode === "document" ? <SupplierInvoiceDocumentAssistant
              file={attachment} originalUrl={originalUrl} projectId={companyFinanzas ? undefined : projectId}
              disabled={isPending || Boolean(savedDraftId) || draftResultUncertain || apSpendMode === "AGAINST_PO"}
              onApply={applyDocumentPreview} onBusyChange={handlePreviewBusyChange} onManual={() => setEntryMode("manual")}
            /> : null}
          </div>
        )}

        <fieldset hidden={!showForm} disabled={!showForm || previewPending} className="min-w-0 space-y-4">
        {assistedDocument ? <div ref={completionRef} tabIndex={-1} className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4 focus:outline-none" aria-label="Completar factura desde comprobante">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><h3 className="font-semibold">Completá y revisá la factura</h3><p className="mt-1 break-all text-xs text-muted-foreground">Original: {assistedDocument.name}</p></div>
            {originalUrl ? <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center text-sm text-primary underline underline-offset-4">Ver original (otra pestaña)</a> : null}
          </div>
          {appliedPreview?.supplierName ? <p className="break-words text-sm">Proveedor leído: <strong>{appliedPreview.supplierName}</strong>{appliedPreview.supplierTaxId ? ` · CUIT ${appliedPreview.supplierTaxId}` : ""}. Elegí el contacto correspondiente abajo.</p> : null}
          <p className="text-xs text-muted-foreground">Todavía no está guardada. El original se adjuntará al borrador; revisá el listado para evitar cargarlo dos veces.</p>
          {documentReview.pending.length ? <div className="space-y-1"><p className="text-sm font-medium">Pendientes para guardar</p><ul className="space-y-1">{documentReview.pending.map(({ label, target }) => <li key={label}><button type="button" onClick={() => focusCompletionTarget(target)} className="min-h-11 text-left text-sm text-primary underline underline-offset-4">{label}</button></li>)}</ul></div> : <p className="text-sm">Datos completos. Compará los importes con el original y confirmá la revisión al pie.</p>}
        </div> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className={cn("space-y-1", showLetter ? "sm:col-span-4" : "sm:col-span-6")}>
            <Label htmlFor="invoice-payee">A quién se le paga</Label>
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay proveedores ni empleados activos. En Directorio el contacto tiene que tener
                rol Proveedor o Empleado; no alcanza con Cliente.
              </p>
            ) : (
              <SearchableCombobox
                id="invoice-payee"
                options={toSearchableOptions(suppliers)}
                value={supplierContactId}
                onValueChange={(id) => {
                  setSupplierContactId(id);
                  setLetterTouched(Boolean(assistedDocument));
                }}
                placeholder="Seleccionar proveedor o empleado…"
                searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
                emptyText="Ningún proveedor o empleado coincide."
                popoverWidth="wide"
              />
            )}
          </div>

          {showLetter ? (
            <InvoiceLetterSelect
              id="invoiceLetter"
              className="sm:col-span-2"
              value={invoiceLetter}
              required
              onValueChange={(v) => {
                setLetterTouched(true);
                setInvoiceLetter(v);
                if (assistedDocument) return;
                if (v === "C" || v === "E") {
                  setPricesIncludeTax(false);
                } else if (!pricesIncludeTaxTouched) {
                  setPricesIncludeTax(v === "B");
                }
                if (!v) return;
                const nextRate = defaultTaxRateForInvoiceLetter(v);
                setLines((prev) =>
                  prev.map((l) => ({
                    ...l,
                    taxRate:
                      v === "C" || v === "E"
                        ? "0"
                        : isZeroIvaRate(l.taxRate)
                          ? nextRate
                          : l.taxRate,
                  })),
                );
              }}
              hint={invoiceLetterHint(invoiceLetter)}
            />
          ) : null}

          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input id="issueDate" name="issueDate" type="date" required value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input id="dueDate" name="dueDate" type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>

          {Boolean(projectId) && !companyFinanzas ? (
            <>
              <div className="space-y-2 sm:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Label>Imputación de costo</Label>
                  <DocumentClassCreateHint
                    variant="inline"
                    showPrefix={false}
                    classLabel={derivedClass.classLabel}
                    classFamily={derivedClass.family}
                  />
                </div>
                <div
                  className="inline-flex flex-wrap rounded-md border border-border bg-muted/40 p-1"
                  role="group"
                  aria-label="Contra OC o costo directo"
                >
                  <button
                    type="button"
                    disabled={isPending || Boolean(assistedDocument)}
                    aria-pressed={apSpendMode === "AGAINST_PO"}
                    onClick={() => selectApSpendMode("AGAINST_PO")}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm transition-colors",
                      apSpendMode === "AGAINST_PO"
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "font-medium text-muted-foreground hover:bg-background/80 hover:text-foreground",
                    )}
                  >
                    Contra orden de compra
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    aria-pressed={apSpendMode === "DIRECT"}
                    onClick={() => selectApSpendMode("DIRECT")}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm transition-colors",
                      apSpendMode === "DIRECT"
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "font-medium text-muted-foreground hover:bg-background/80 hover:text-foreground",
                    )}
                  >
                    Costo directo
                  </button>
                </div>
                {apSpendMode === "DIRECT" ? null : filteredPOs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No hay OC confirmadas/recibidas para este proveedor. Cambiá el payee o usá costo directo.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <Label>Orden de compra</Label>
                    <SearchableCombobox
                      options={poComboboxOptions}
                      value={purchaseOrderId ?? SEARCHABLE_NONE}
                      onValueChange={(v) =>
                        onPurchaseOrderChange(v === SEARCHABLE_NONE ? null : v)
                      }
                      placeholder="Seleccionar OC…"
                      searchPlaceholder="Buscar OC…"
                    />
                  </div>
                )}
              </div>
              {!assistedDocument ? <PricesIncludeTaxCheckbox
                compact
                className="sm:col-span-3"
                checked={pricesIncludeTax}
                onCheckedChange={(v) => {
                  setPricesIncludeTaxTouched(true);
                  setPricesIncludeTax(v);
                }}
              /> : null}
            </>
          ) : (
            <>
              <div className="space-y-1.5 sm:col-span-3">
                <DocumentClassCreateHint
                  variant="inline"
                  showPrefix={false}
                  classLabel={derivedClass.classLabel}
                  classFamily={derivedClass.family}
                />
                {classHint ? (
                  <p className="text-xs text-muted-foreground">{classHint}</p>
                ) : null}
              </div>
              {!assistedDocument ? <PricesIncludeTaxCheckbox
                compact
                className="sm:col-span-3"
                checked={pricesIncludeTax}
                onCheckedChange={(v) => {
                  setPricesIncludeTaxTouched(true);
                  setPricesIncludeTax(v);
                }}
              /> : null}
            </>
          )}
          {assistedDocument ? <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="document-price-basis">¿Los precios unitarios incluyen IVA?</Label>
            <Select value={priceBasisKnown ? pricesIncludeTax ? "gross" : "net" : ""} onValueChange={(value) => { setPricesIncludeTaxTouched(true); setPriceBasisKnown(true); setPricesIncludeTax(value === "gross"); }}>
              <SelectTrigger id="document-price-basis" className="min-h-11"><SelectValue placeholder="Seleccioná según el original" /></SelectTrigger>
              <SelectContent><SelectItem value="net">No, son precios sin IVA</SelectItem><SelectItem value="gross">Sí, son precios con IVA</SelectItem></SelectContent>
            </Select>
          </div> : null}
        </div>

        {supportsPoPreview && purchaseOrderId && (
          <PoBillingReference
            loading={previewLoading}
            preview={poPreview}
            onBringLines={bringPoLines}
          />
        )}

        <div id="invoice-lines" tabIndex={-1} className="border-t border-border/60 pt-4">
          <InvoiceLinesEditor
            key={assistedDocument ? "document" : "manual"}
            documentReview={Boolean(assistedDocument)}
            amountsPending={Boolean(assistedDocument) && documentReview.amountsPending}
            lines={lines}
            onChange={setLines}
            requireWbs={Boolean(projectId) && !companyFinanzas}
            wbsOptions={wbsOptions}
            pricesIncludeTax={pricesIncludeTax}
            iibbPerceptionRate={iibbPerceptionRate}
            onIibbPerceptionRateChange={setIibbPerceptionRate}
            seedFirstLineCostTypeAsManual={Boolean(
              initialLine?.costType === "LABOR" ||
                initialLine?.costType === "EQUIPMENT" ||
                initialLine?.costType === "MATERIAL" ||
                initialLine?.costType === "SUBCONTRACT" ||
                initialLine?.costType === "OTHER",
            )}
          />
        </div>

        <ExpandableNotesField />

        {assistedDocument ? <div className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
          <p className="text-sm font-semibold">Antes de guardar el borrador</p>
          <p className="text-sm">Total leído del original: <strong>{appliedPreview?.total ? formatMoneyAmount(appliedPreview.total, "ARS") : "No identificado: consultá el comprobante"}</strong>.</p>
          {originalUrl ? <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Volver a ver el original</a> : null}
          {documentReview.pending.length ? <p className="text-sm text-muted-foreground">Completá los pendientes indicados arriba para confirmar la revisión.</p> : null}
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={documentReviewed} disabled={documentReview.pending.length > 0}
              onChange={(event) => setReviewedSnapshot(event.target.checked ? currentReviewSnapshot : null)} />
            <span>Verifiqué proveedor, fechas, renglones, impuestos y total contra el original. No hay cargos fuera de los registrados. Si cambio algún dato, debo volver a confirmar.</span>
          </label>
          <p className="text-xs text-muted-foreground">Se guarda un borrador con el original. Emitir y pagar son acciones posteriores desde el detalle.</p>
        </div> : null}

        {showPayNow && (
          <div className="space-y-3 rounded-md border bg-muted/10 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={payNow}
                onChange={(e) => setPayNow(e.target.checked)}
                disabled={isPending}
              />
              Emitir y pagar ahora (egreso de caja)
            </label>
            <p className="text-xs text-muted-foreground">
              Emite la factura, crea la cuenta por pagar y registra el pago total en la misma operación.
              Sin esta opción se guarda como borrador.
            </p>
            {payNow && (
              compatibleAccounts.length === 0 ? (
                <p className="text-sm text-amber-800 dark:text-amber-200 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2">
                  No hay cuentas de tesorería activas en {INVOICE_CURRENCY}. Creá una caja o banco
                  en esa moneda para poder pagar ahora.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Cuenta de pago</Label>
                    <SearchableCombobox
                      options={treasuryOptions}
                      value={payAccountId}
                      onValueChange={setPayAccountId}
                      placeholder="Cuenta…"
                      searchPlaceholder="Buscar cuenta…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="paymentDate">Fecha de pago</Label>
                    <Input id="paymentDate" name="paymentDate" type="date" required />
                  </div>
                  <div className="sm:col-span-2">
                    <SettlementFields
                      idPrefix="supplier-pay-now"
                      paymentMethod={payMethod}
                      onPaymentMethodChange={setPayMethod}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" className="min-h-11" variant="outline" disabled={isPending || previewPending} onClick={() => { if (!isBusy()) (onCancel ?? (() => router.back()))(); }}>
            Cancelar
          </Button>
          <Button
            type="submit"
            className="min-h-11"
            disabled={
              isPending
              || previewPending
              || suppliers.length === 0
              || (Boolean(assistedDocument) && (documentReview.pending.length > 0 || !documentReviewed))
              || (payNow && showPayNow && compatibleAccounts.length === 0)
            }
          >
            {isPending
              ? "Guardando…"
              : payNow && showPayNow
                ? "Emitir y pagar"
                : assistedDocument ? "Guardar borrador" : "Crear factura"}
          </Button>
        </div>
        </fieldset>
        {!showForm ? <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={isPending || previewPending} onClick={() => { if (!isBusy()) (onCancel ?? (() => router.back()))(); }}>Cancelar</Button> : null}
        </fieldset>
        <div ref={outcomeRef} tabIndex={-1} className="focus:outline-none">
        {savedDraftId && draftAttachmentError ? (
          <div role="alert" className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <p>El borrador ya está guardado. No se pudo adjuntar el comprobante: {draftAttachmentError}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => { if (!isBusy()) void run(() => saveDraft(async () => ({ error: "El borrador ya existe." }))); }}>{isPending ? "Adjuntando…" : "Reintentar adjunto"}</Button>
              <Button type="button" variant="outline" disabled={isPending} onClick={() => openDraft(savedDraftId)}>Abrir borrador</Button>
            </div>
            <p className="text-xs">Reintentar conserva el mismo borrador. Si abrís el detalle, el archivo pendiente sigue disponible en tu dispositivo para adjuntarlo allí.</p>
          </div>
        ) : null}
        {draftResultUncertain ? (
          <div role="alert" className="space-y-2 rounded-md border p-3 text-sm">
            <p>No se repetirá la creación desde este formulario. Revisá si el borrador aparece en el listado antes de volver a cargarlo.</p>
            <Button type="button" variant="outline" onClick={() => { onSuccess?.(); router.push(invoiceListHref); }}>Revisar listado</Button>
          </div>
        ) : null}
        </div>
      </form>
    </div>
  );
}

function PoBillingReference({
  loading,
  preview,
  onBringLines,
}: {
  loading: boolean;
  preview: PurchaseOrderInvoiceDraftPreview | null;
  onBringLines: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Cargando estado de facturación de la OC…
      </div>
    );
  }
  if (!preview) return null;

  const { summary, currency } = preview;
  const hasPending = preview.lines.length > 0;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">Estado de facturación de la OC (recibido vs. facturado)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Se factura contra lo recibido (matching a 3 vías). Traé el pendiente y ajustá si hace falta.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          Recibido: <span className="font-medium tabular-nums text-foreground">{formatMoneyAmount(summary.receivedAmount, currency)}</span>
        </span>
        <span className="text-muted-foreground">
          Facturado: <span className="font-medium tabular-nums text-foreground">{formatMoneyAmount(summary.invoicedAmount, currency)}</span>
        </span>
        <span className="text-muted-foreground">
          Pagado: <span className="font-medium tabular-nums text-foreground">{formatMoneyAmount(summary.paidAmount, currency)}</span>
        </span>
        <span className="text-muted-foreground">
          Pendiente por importes:{" "}
          <span className="font-semibold tabular-nums text-foreground">{formatMoneyAmount(summary.pendingToInvoice, currency)}</span>
        </span>
      </div>
      {hasPending ? (
        <Button type="button" variant="outline" size="sm" onClick={onBringLines}>
          Traer líneas de la OC (pendiente de facturar)
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {summary.hasReceivedQuantity
            ? "No hay cantidades pendientes que se puedan sugerir desde esta OC."
            : "La OC aún no tiene cantidades recibidas para facturar."}
        </p>
      )}
    </div>
  );
}

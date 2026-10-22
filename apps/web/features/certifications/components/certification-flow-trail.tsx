import Link from "next/link";
import type { ProcessStep, ProcessStepState } from "@bloqer/domain";
import type { CertificationStatus } from "@bloqer/database";
import { ProcessStepper } from "@/components/ui/process-stepper";
import { formatMoneyAmount } from "@/lib/format-money";

type InvoiceRef = {
  id: string;
  code: string;
  status: string;
  receivableId: string | null;
  canCollect: boolean;
} | null;

type CollectionRef = {
  id: string;
  accountName: string;
  amount: string;
};

interface Props {
  projectId: string;
  status: CertificationStatus;
  hasLines: boolean;
  currency: string;
  moneyVisible: boolean;
  invoice: InvoiceRef;
  collections: CollectionRef[];
}

const COPY = {
  medir: {
    who: "Jefe de obra",
    detail: "Revisá la sugerencia de avance, ajustá la cantidad y guardá cada medición.",
  },
  emitir: {
    who: "Jefe de obra",
    detail:
      "Congela el certificado y controla que la cantidad y el avance físico acumulados no superen el 100%.",
  },
  aprobar: {
    who: "Quien aprueba",
    detail:
      "Registrá la aprobación del cliente para habilitar la factura. Este paso todavía no genera deuda ni ingreso de dinero.",
  },
  factura: {
    who: "Finanzas",
    detail: "Creá y emití la factura para abrir la cuenta por cobrar de esta obra.",
  },
  cobrar: {
    who: "Tesorería",
    detail: "Registrá el cobro y elegí la cuenta de la empresa donde ingresó el dinero.",
  },
} as const;

type StepId = keyof typeof COPY;

function stepVisual(id: StepId, props: Props): { state: ProcessStepState; label: string } {
  const { status, hasLines, invoice, collections } = props;
  const issued = status === "ISSUED" || status === "APPROVED";
  const approved = status === "APPROVED";
  const invoiced = invoice?.status === "ISSUED";
  const collected = collections.length > 0;

  if (status === "CANCELLED") {
    if (id === "medir" && hasLines) return { state: "done", label: "Medir" };
    return { state: "cancelled", label: id === "medir" ? "Medir" : labelOf(id) };
  }
  if (status === "REJECTED") {
    if (id === "medir" || id === "emitir") return { state: "done", label: labelOf(id) };
    if (id === "aprobar") return { state: "current", label: "Rechazada" };
    return { state: "upcoming", label: labelOf(id) };
  }
  if (id === "medir") return { state: hasLines || issued ? "done" : "current", label: "Medir" };
  if (id === "emitir")
    return { state: issued ? "done" : hasLines ? "current" : "upcoming", label: "Emitir" };
  if (id === "aprobar")
    return {
      state: approved ? "done" : status === "ISSUED" ? "current" : "upcoming",
      label: "Aprobar",
    };
  if (id === "factura") {
    if (invoiced) return { state: "done", label: "Facturar" };
    if (invoice?.status === "DRAFT" || approved) return { state: "current", label: "Facturar" };
    return { state: "upcoming", label: "Facturar" };
  }
  if (!invoiced) return { state: "upcoming", label: "Cobrar" };
  if (collected && !invoice?.canCollect) return { state: "done", label: "Cobrar" };
  return { state: "current", label: "Cobrar" };
}

function labelOf(id: StepId): string {
  if (id === "medir") return "Medir";
  if (id === "emitir") return "Emitir";
  if (id === "aprobar") return "Aprobar";
  if (id === "factura") return "Facturar";
  return "Cobrar";
}

function focusId(steps: ProcessStep[]): StepId {
  const current = steps.find((step) => step.state === "current" || step.state === "cancelled");
  if (current) return current.id as StepId;
  return "cobrar";
}

export function CertificationFlowTrail(props: Props) {
  const { projectId, moneyVisible, invoice, collections, currency } = props;
  const steps: ProcessStep[] = (Object.keys(COPY) as StepId[]).map((id) => {
    const visual = stepVisual(id, props);
    return {
      id,
      label: visual.label,
      state: visual.state,
      replacedLabel: visual.state === "cancelled" ? labelOf(id) : undefined,
    };
  });
  const focus = COPY[focusId(steps)];
  const completed = steps.every((step) => step.state === "done");

  return (
    <div className="space-y-3">
      <ProcessStepper aria-label="Recorrido de la certificación" steps={steps} />
      <section className="rounded-lg border bg-card px-4 py-3">
        <p className="text-sm">
          <span className="font-medium">
            {props.status === "CANCELLED"
              ? "Anulado."
              : completed
                ? "Cobro registrado."
                : focus.who + "."}
          </span>{" "}
          <span className="text-muted-foreground">
            {props.status === "CANCELLED"
              ? "No sigue a factura ni a cobranza."
              : props.status === "REJECTED" && focusId(steps) === "aprobar"
                ? "El mandante rechazó el certificado. No se factura ni se elige cuenta."
                : completed
                  ? "La factura no tiene saldo pendiente de cobro. Podés consultar las cuentas de destino abajo."
                  : focus.detail}
          </span>
        </p>
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Cómo sigue hasta el cobro</summary>
          <p className="mt-2">
            La factura emitida crea la cuenta por cobrar. Al confirmar la cobranza, elegís la cuenta
            de la empresa donde ingresó el dinero. La factura y el ingreso conservan su vínculo con
            esta obra para los reportes.
          </p>
        </details>
        {moneyVisible && invoice ? (
          <p className="mt-2 text-xs">
            <Link
              href={`/proyectos/${projectId}/facturas/${invoice.id}`}
              className="text-primary hover:underline"
            >
              {invoice.code}
            </Link>
            {invoice.status === "DRAFT" ? " · borrador, todavía sin cuenta por cobrar" : null}
            {invoice.status === "ISSUED"
              ? invoice.canCollect
                ? " · emitida, con saldo pendiente"
                : " · emitida, sin saldo pendiente de cobro"
              : null}
          </p>
        ) : null}
        {moneyVisible && collections.length > 0 ? (
          <ul className="mt-1 space-y-1 text-xs">
            {collections.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/proyectos/${projectId}/cobranzas/${c.id}`}
                  className="text-primary hover:underline"
                >
                  {c.accountName}
                </Link>
                {` · ${formatMoneyAmount(c.amount)} ${currency}`}
              </li>
            ))}
          </ul>
        ) : null}
        {!moneyVisible && (props.status === "APPROVED" || invoice) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            La factura se consulta con permiso de cuentas por cobrar.
          </p>
        ) : null}
      </section>
    </div>
  );
}

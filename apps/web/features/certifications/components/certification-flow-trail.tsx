import Link from "next/link";
import type { CertificationStatus } from "@bloqer/database";
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

type StepState = "done" | "current" | "pending" | "stopped";

const STEPS = [
  {
    id: "medir",
    title: "Medir",
    who: "Jefe de obra",
    detail: "Elige las partidas y la cantidad. El libro y el costo quedan como referencia.",
  },
  {
    id: "emitir",
    title: "Emitir",
    who: "Jefe de obra",
    detail: "Congela el certificado. En obra pública no se puede superar el presupuesto. En obra privada hace falta una nota.",
  },
  {
    id: "aprobar",
    title: "Aprobar",
    who: "Quien aprueba",
    detail: "Reconoce el avance del mandante. No elige caja, banco ni cuenta contable.",
  },
  {
    id: "factura",
    title: "Emitir factura",
    who: "Finanzas",
    detail: "Abre la cuenta por cobrar. Si la contabilidad está activa, el asiento borrador debita Clientes y acredita Ingresos por obras. Lo publica contabilidad.",
  },
  {
    id: "cobrar",
    title: "Cobrar",
    who: "Tesorería",
    detail: "Elige la caja o el banco donde entró la plata. El asiento debita esa cuenta y acredita Clientes.",
  },
] as const;

function stepState(id: (typeof STEPS)[number]["id"], props: Props): StepState {
  const { status, hasLines, invoice, collections } = props;
  if (status === "CANCELLED") return id === "medir" && hasLines ? "done" : "stopped";
  if (status === "REJECTED") {
    if (id === "medir" || id === "emitir") return "done";
    if (id === "aprobar") return "stopped";
    return "pending";
  }
  const issued = status === "ISSUED" || status === "APPROVED";
  const approved = status === "APPROVED";
  const invoiced = invoice?.status === "ISSUED";
  const collected = collections.length > 0;
  if (id === "medir") return hasLines || issued ? "done" : "current";
  if (id === "emitir") {
    if (issued) return "done";
    return hasLines ? "current" : "pending";
  }
  if (id === "aprobar") {
    if (approved) return "done";
    return status === "ISSUED" ? "current" : "pending";
  }
  if (id === "factura") {
    if (invoiced) return "done";
    if (invoice?.status === "DRAFT" || approved) return "current";
    return "pending";
  }
  if (id === "cobrar") {
    if (!invoiced) return "pending";
    if (collected && !invoice?.canCollect) return "done";
    return "current";
  }
  return "pending";
}

const STATE_LABEL: Record<StepState, string> = {
  done: "Hecho",
  current: "Ahora",
  pending: "Después",
  stopped: "Cerrado",
};

export function CertificationFlowTrail(props: Props) {
  const { projectId, moneyVisible, invoice, collections, currency } = props;

  return (
    <section className="rounded-lg border bg-card px-4 py-3">
      <h2 className="text-sm font-semibold">Recorrido hasta la cuenta</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Aprobar el certificado no mueve caja ni elige cuenta. La deuda nace al emitir la factura.
        La caja se mueve al confirmar la cobranza.
      </p>
      <ol className="mt-3 space-y-3">
        {STEPS.map((step, index) => {
          const state = stepState(step.id, props);
          return (
            <li key={step.id} className="flex gap-3 text-sm">
              <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-muted-foreground">{index + 1}</span>
              <div className="min-w-0">
                <p className="font-medium">
                  {step.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {step.who} · {STATE_LABEL[state]}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
                {step.id === "factura" && moneyVisible && invoice ? (
                  <p className="mt-1 text-xs">
                    <Link
                      href={`/proyectos/${projectId}/facturas/${invoice.id}`}
                      className="text-primary hover:underline"
                    >
                      {invoice.code}
                    </Link>
                    {invoice.status === "DRAFT" ? " · borrador, todavía sin cuenta por cobrar" : null}
                    {invoice.status === "ISSUED" ? " · emitida, cuenta por cobrar abierta" : null}
                  </p>
                ) : null}
                {step.id === "cobrar" && moneyVisible && collections.length > 0 ? (
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
                {step.id === "factura" && !moneyVisible && (props.status === "APPROVED" || invoice) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    La factura se consulta con permiso de cuentas por cobrar.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

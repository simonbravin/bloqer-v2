import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Bell,
  BookOpen,
  Building,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileEdit,
  FolderKanban,
  GanttChartSquare,
  Landmark,
  ListChecks,
  Percent,
  PieChart,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

export type KpiStatTone = "default" | "success" | "warning" | "danger" | "muted";

export type KpiIconAccent = "default" | "success" | "info" | "warning" | "danger" | "muted";

export type KpiStatIconMeta = {
  Icon: LucideIcon;
  accent: KpiIconAccent;
};

export const kpiIconAccentClass: Record<KpiIconAccent, { container: string; icon: string }> = {
  default: {
    container: "bg-muted",
    icon: "text-muted-foreground",
  },
  success: {
    container: "bg-emerald-500/10 dark:bg-emerald-500/15",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  info: {
    container: "bg-sky-500/10 dark:bg-sky-500/15",
    icon: "text-sky-600 dark:text-sky-400",
  },
  warning: {
    container: "bg-amber-500/10 dark:bg-amber-500/15",
    icon: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    container: "bg-destructive/10",
    icon: "text-destructive",
  },
  muted: {
    container: "bg-muted/80",
    icon: "text-muted-foreground",
  },
};

const KEY_ICON: Record<string, { Icon: LucideIcon; accent: KpiIconAccent }> = {
  notifications_unread: { Icon: Bell, accent: "warning" },
  projects_active: { Icon: FolderKanban, accent: "info" },
  certifications_pending: { Icon: ClipboardCheck, accent: "warning" },
  ar_open: { Icon: ArrowUpCircle, accent: "info" },
  ap_open: { Icon: ArrowDownCircle, accent: "warning" },
  ar_overdue: { Icon: AlertCircle, accent: "danger" },
  ap_overdue: { Icon: AlertCircle, accent: "danger" },
  ar_due_soon: { Icon: Clock, accent: "muted" },
  ap_due_soon: { Icon: Clock, accent: "muted" },
  treasury_balance: { Icon: Landmark, accent: "success" },
  treasury_accounts: { Icon: Wallet, accent: "info" },
  treasury_monthly_expenses: { Icon: Receipt, accent: "default" },
  tr_cash: { Icon: Landmark, accent: "success" },
  tr_ar_open: { Icon: ArrowUpCircle, accent: "info" },
  tr_ap_open: { Icon: ArrowDownCircle, accent: "warning" },
  tr_ar_overdue: { Icon: AlertCircle, accent: "danger" },
  tr_ap_overdue: { Icon: AlertCircle, accent: "danger" },
  tr_draft_invoices: { Icon: FileEdit, accent: "warning" },
  tr_attr_project_out: { Icon: Building2, accent: "info" },
  tr_attr_corp_out: { Icon: Building, accent: "muted" },
  pf_ar_open: { Icon: ArrowUpCircle, accent: "info" },
  pf_ap_open: { Icon: ArrowDownCircle, accent: "warning" },
  pf_ar_overdue: { Icon: AlertCircle, accent: "danger" },
  pf_ap_overdue: { Icon: AlertCircle, accent: "danger" },
  pf_cash_net: { Icon: TrendingUp, accent: "success" },
  p_ar_open: { Icon: ArrowUpCircle, accent: "info" },
  p_ap_open: { Icon: ArrowDownCircle, accent: "warning" },
  p_gross_margin: { Icon: Percent, accent: "success" },
  schedule_progress: { Icon: GanttChartSquare, accent: "info" },
  budget_sale: { Icon: Calculator, accent: "default" },
  cash_flow: { Icon: TrendingUp, accent: "success" },
  cost_control: { Icon: PieChart, accent: "info" },
  gross_margin: { Icon: Percent, accent: "success" },
  accounting: { Icon: BookOpen, accent: "muted" },
  aging_current: { Icon: CheckCircle2, accent: "success" },
  aging_overdue: { Icon: AlertCircle, accent: "danger" },
  aging_balance: { Icon: Wallet, accent: "default" },
  aging_bucket: { Icon: Clock, accent: "warning" },
  schedule_items: { Icon: ListChecks, accent: "info" },
  schedule_completed: { Icon: CheckCircle2, accent: "success" },
  schedule_delayed: { Icon: AlertTriangle, accent: "danger" },
  cost_budget: { Icon: Calculator, accent: "default" },
  cost_exposure: { Icon: TrendingUp, accent: "warning" },
  cost_certified: { Icon: ClipboardCheck, accent: "info" },
  cost_variance: { Icon: TrendingDown, accent: "danger" },
};

function toneToAccent(tone?: KpiStatTone): KpiIconAccent {
  switch (tone) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    case "muted":
      return "muted";
    default:
      return "default";
  }
}

function inferFromLabel(label: string, tone?: KpiStatTone): KpiStatIconMeta {
  const normalized = label.toLowerCase();

  if (normalized.includes("notificacion")) return { Icon: Bell, accent: toneToAccent(tone) };
  if (normalized.includes("proyecto")) return { Icon: FolderKanban, accent: "info" };
  if (normalized.includes("presupuesto")) return { Icon: Calculator, accent: "default" };
  if (normalized.includes("certificad")) return { Icon: ClipboardCheck, accent: toneToAccent(tone) };
  if (normalized.includes("vencid") || normalized.includes("atrasad")) {
    return { Icon: AlertCircle, accent: tone === "muted" ? "warning" : "danger" };
  }
  if (normalized.includes("por cobrar") || normalized.includes("c×c") || normalized.includes("cobros")) {
    return { Icon: ArrowUpCircle, accent: "info" };
  }
  if (normalized.includes("por pagar") || normalized.includes("c×p") || normalized.includes("pagos")) {
    return { Icon: ArrowDownCircle, accent: "warning" };
  }
  if (normalized.includes("caja") || normalized.includes("tesorer") || normalized.includes("saldo")) {
    return { Icon: Landmark, accent: toneToAccent(tone ?? "success") };
  }
  if (normalized.includes("margen") || normalized.includes("variación") || normalized.includes("variacion")) {
    const isVariance = normalized.includes("variación") || normalized.includes("variacion");
    return {
      Icon: isVariance ? (tone === "success" ? TrendingUp : TrendingDown) : Percent,
      accent: toneToAccent(tone),
    };
  }
  if (normalized.includes("avance") || normalized.includes("cronograma")) {
    return { Icon: GanttChartSquare, accent: "info" };
  }
  if (normalized.includes("flujo")) return { Icon: TrendingUp, accent: toneToAccent(tone ?? "success") };
  if (normalized.includes("gasto")) return { Icon: Receipt, accent: "default" };
  if (normalized.includes("completad")) return { Icon: CheckCircle2, accent: "success" };
  if (normalized.includes("ítem") || normalized.includes("item")) return { Icon: ListChecks, accent: "info" };
  if (normalized.includes("al día") || normalized.includes("al dia")) {
    return { Icon: CheckCircle2, accent: "success" };
  }
  if (normalized.includes("contabiliz")) return { Icon: BookOpen, accent: "muted" };
  if (normalized.includes("borrador")) return { Icon: FileEdit, accent: "warning" };

  return { Icon: Wallet, accent: toneToAccent(tone) };
}

function syncIconAccentWithTone(
  iconKey: string | undefined,
  tone: KpiStatTone | undefined,
  accent: KpiIconAccent,
): KpiIconAccent {
  if (!tone || tone === "default") return accent;
  // Open-balance KPIs keep category hue (C×C azul, C×P ámbar) unless explicitly danger.
  if (
    tone !== "danger" &&
    iconKey != null &&
    (iconKey.endsWith("_open") || iconKey.endsWith("_due_soon"))
  ) {
    return accent;
  }
  return toneToAccent(tone);
}

export function resolveKpiStatIcon({
  iconKey,
  label,
  tone,
}: {
  iconKey?: string;
  label: string;
  tone?: KpiStatTone;
}): KpiStatIconMeta {
  const fromKey = iconKey ? KEY_ICON[iconKey] : undefined;
  if (fromKey) {
    if (iconKey === "cost_variance") {
      return {
        Icon: tone === "success" ? TrendingUp : TrendingDown,
        accent: toneToAccent(tone ?? "default"),
      };
    }
    if (iconKey === "pf_cash_net") {
      return {
        Icon: tone === "danger" || tone === "warning" ? TrendingDown : TrendingUp,
        accent: toneToAccent(tone ?? "success"),
      };
    }

    const accent = syncIconAccentWithTone(iconKey, tone, fromKey.accent);
    return { Icon: fromKey.Icon, accent };
  }

  const inferred = inferFromLabel(label, tone);
  return {
    Icon: inferred.Icon,
    accent: syncIconAccentWithTone(iconKey, tone, inferred.accent),
  };
}

import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  FileText,
  MapPin,
  User,
} from "lucide-react";
import { kpiIconAccentClass, type KpiIconAccent } from "@/lib/kpi-stat-icon";

export type DetailFieldIconKey =
  | "client"
  | "type"
  | "start_date"
  | "expected_end"
  | "actual_end"
  | "address"
  | "description";

const DETAIL_FIELD_ICONS: Record<
  DetailFieldIconKey,
  { Icon: LucideIcon; accent: KpiIconAccent }
> = {
  client: { Icon: User, accent: "info" },
  type: { Icon: Building2, accent: "muted" },
  start_date: { Icon: Calendar, accent: "info" },
  expected_end: { Icon: CalendarClock, accent: "warning" },
  actual_end: { Icon: CalendarCheck, accent: "success" },
  address: { Icon: MapPin, accent: "info" },
  description: { Icon: FileText, accent: "default" },
};

export function resolveDetailFieldIcon(
  iconKey: DetailFieldIconKey,
  accentOverride?: KpiIconAccent,
) {
  const meta = DETAIL_FIELD_ICONS[iconKey];
  if (!meta) {
    return {
      Icon: FileText,
      accentClass: kpiIconAccentClass.default,
    };
  }
  const accent = accentOverride ?? meta.accent;
  return {
    Icon: meta.Icon,
    accentClass: kpiIconAccentClass[accent],
  };
}

export type { KpiIconAccent as DetailFieldIconAccent };

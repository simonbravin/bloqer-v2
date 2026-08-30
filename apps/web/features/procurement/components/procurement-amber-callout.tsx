import type { ReactNode } from "react";
import {
  procurementAmberCalloutClass,
  procurementAmberInsetClass,
} from "../lib/procurement-ui";

type Props = {
  children: ReactNode;
  className?: string;
  /** Compact inset (e.g. matching 3 vías inside a panel). */
  inset?: boolean;
  role?: "status" | "note";
};

/** Homogeneous amber callout for procurement status / next-step hints. */
export function ProcurementAmberCallout({
  children,
  className,
  inset = false,
  role = "status",
}: Props) {
  const base = inset ? procurementAmberInsetClass : procurementAmberCalloutClass;
  return (
    <div className={className ? `${base} ${className}` : base} role={role}>
      {children}
    </div>
  );
}

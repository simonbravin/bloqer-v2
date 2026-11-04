"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Server-action forms share the same pending affordance as client procurement mutations. */
export function ProcurementSubmitButton({ children, pendingLabel = "Procesando…", ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" disabled={pending || props.disabled} aria-busy={pending}>{pending ? pendingLabel : children}</Button>;
}

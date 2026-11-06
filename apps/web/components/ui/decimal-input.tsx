"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  DISPLAY_DECIMALS,
  formatDecimalEditBuffer,
  formatGroupedDecimal,
} from "@bloqer/utils";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DecimalInputDraft } from "./decimal-input-draft";

type DecimalInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (canonical: string) => void;
  /** Fractional digits for display. Default 2 (D-053). */
  scale?: number;
  /** Editable/persisted precision, independent of display (unit prices/qty/%: 4). */
  precision?: number;
};

const INVALID_DECIMAL = "Ingresá un número válido.";

/** Same native feedback for decimal editors whose actions sit outside a form. */
export function reportInvalidDecimalInputs(scope: ParentNode | null): boolean {
  const inputs = scope?.querySelectorAll<HTMLInputElement>("input[data-decimal-input]:invalid");
  if (!inputs) return true;
  for (const input of inputs) {
    if (!input.validity.customError || input.getClientRects().length === 0) continue;
    input.reportValidity();
    return false;
  }
  return true;
}

/** Canonical DecimalInput string → number for RHF `valueAsNumber` fields. */
export function numberFromCanonicalDecimal(canonical: string): number {
  const t = canonical.trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** RHF number / unknown → canonical string for DecimalInput. */
export function stringFromRhfNumber(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const t = String(value).trim();
  return t;
}

/** Bind DecimalInput to an RHF numeric field without type="number". */
export function bindRhfNumberDecimal(
  value: unknown,
  setNumber: (n: number) => void,
): { value: string; onValueChange: (canonical: string) => void } {
  return {
    value: stringFromRhfNumber(value),
    onValueChange: (canonical) => setNumber(numberFromCanonicalDecimal(canonical)),
  };
}

function displayFromCanonical(canonical: string, scale: number): string {
  const t = canonical.trim();
  if (!t) return "";
  try {
    return formatGroupedDecimal(t, scale);
  } catch {
    return canonical;
  }
}

export function DecimalInput({
  value,
  onValueChange,
  scale = DISPLAY_DECIMALS,
  precision = scale,
  name,
  disabled,
  form: formId,
  className,
  onBlur,
  onFocus,
  onKeyDown,
  ...rest
}: DecimalInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => displayFromCanonical(value, scale));
  const [invalidDraft, setInvalidDraft] = useState(false);
  const errorId = useId();
  const hiddenRef = useRef<HTMLInputElement>(null);
  const visibleRef = useRef<HTMLInputElement>(null);
  const previousValueRef = useRef(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const precisionRef = useRef(precision);
  precisionRef.current = precision;
  const editRef = useRef(new DecimalInputDraft());
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  useEffect(() => {
    const valueChanged = value !== previousValueRef.current;
    previousValueRef.current = value;
    if (!focused && (!invalidDraft || valueChanged)) {
      setDraft(displayFromCanonical(value, scale));
      editRef.current.reset();
      visibleRef.current?.setCustomValidity("");
      setInvalidDraft(false);
    }
  }, [value, scale, focused, invalidDraft]);

  useEffect(() => {
    const input = visibleRef.current;
    if (!invalidDraft || !input) return;
    const syncValidity = () => {
      input.setCustomValidity(input.getClientRects().length ? INVALID_DECIMAL : "");
    };
    syncValidity();
    const observer = new ResizeObserver(syncValidity);
    observer.observe(input);
    return () => observer.disconnect();
  }, [invalidDraft]);

  function emitCanonical(canonical: string) {
    if (hiddenRef.current) hiddenRef.current.value = canonical;
    onValueChangeRef.current(canonical);
  }

  function setValidity(invalid: boolean) {
    const input = visibleRef.current;
    input?.setCustomValidity(invalid && input.getClientRects().length ? INVALID_DECIMAL : "");
    setInvalidDraft(invalid);
  }

  function commit(raw: string): boolean {
    // Formatting must never rewrite an untouched stored value on blur or submit.
    let rounded: string | null;
    try {
      rounded = editRef.current.commit(raw, precisionRef.current);
    } catch {
      setValidity(true);
      return false;
    }
    if (rounded === null) {
      const invalid = editRef.current.hasInvalidEdit(raw);
      setValidity(invalid);
      return !invalid;
    }
    setValidity(false);
    emitCanonical(rounded);
    setDraft(rounded ? formatDecimalEditBuffer(rounded, precisionRef.current) : "");
    return true;
  }

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    const form = visibleRef.current?.form;
    if (!form) return;
    const onSubmit = (event: Event) => {
      const input = visibleRef.current;
      if (!input?.willValidate || input.getClientRects().length === 0) return;
      // Capture-phase: commit before the form reads React state (jobsite log qty, money, etc.).
      let valid = true;
      flushSync(() => {
        valid = commitRef.current(draftRef.current);
      });
      if (!valid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.reportValidity();
      }
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [formId]);

  const describedBy = [rest["aria-describedby"], invalidDraft && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <>
      {name ? <input ref={hiddenRef} type="hidden" name={name} value={value} form={formId} disabled={disabled} /> : null}
      <Input
        {...rest}
        ref={visibleRef}
        name={undefined}
        form={formId}
        disabled={disabled}
        type="text"
        data-decimal-input=""
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalidDraft || rest["aria-invalid"]}
        aria-describedby={describedBy}
        className={cn("tabular-nums", className, invalidDraft && "border-destructive")}
        value={focused || invalidDraft ? draft : displayFromCanonical(value, scale)}
        onFocus={(e) => {
          setFocused(true);
          if (!invalidDraft) {
            const t = value.trim();
            setDraft(t ? formatDecimalEditBuffer(t, precision) : "");
          }
          onFocus?.(e);
        }}
        onChange={(e) => {
          const next = e.target.value;
          draftRef.current = next;
          setDraft(next);
          try {
            const canonical = editRef.current.change(next, precisionRef.current);
            setValidity(canonical === null && editRef.current.hasInvalidEdit(next));
            if (canonical != null) emitCanonical(canonical);
          } catch {
            setValidity(true);
          }
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key === "Enter" && !e.defaultPrevented && !commit(e.currentTarget.value)) {
            e.preventDefault();
            e.currentTarget.reportValidity();
          }
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.currentTarget.value);
          onBlur?.(e);
        }}
      />
      <span id={errorId} className="sr-only" aria-live="polite">{invalidDraft ? INVALID_DECIMAL : ""}</span>
    </>
  );
}

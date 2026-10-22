"use client";

import { useEffect, useRef, useState } from "react";
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
  className,
  onBlur,
  onFocus,
  onKeyDown,
  ...rest
}: DecimalInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => displayFromCanonical(value, scale));
  const hiddenRef = useRef<HTMLInputElement>(null);
  const visibleRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const precisionRef = useRef(precision);
  precisionRef.current = precision;
  const editRef = useRef(new DecimalInputDraft());
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  useEffect(() => {
    if (!focused) {
      setDraft(displayFromCanonical(value, scale));
      editRef.current.reset();
    }
  }, [value, scale, focused]);

  function emitCanonical(canonical: string) {
    if (hiddenRef.current) hiddenRef.current.value = canonical;
    onValueChangeRef.current(canonical);
  }

  function commit(raw: string) {
    // Formatting must never rewrite an untouched stored value on blur or submit.
    try {
      const rounded = editRef.current.commit(raw, precisionRef.current);
      if (rounded == null) return;
      emitCanonical(rounded);
      setDraft(rounded ? formatDecimalEditBuffer(rounded, precisionRef.current) : "");
    } catch {
      /* keep draft */
    }
  }

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    const form = visibleRef.current?.form;
    if (!form) return;
    const onSubmit = () => {
      // Capture-phase: commit before the form reads React state (jobsite log qty, money, etc.).
      flushSync(() => {
        commitRef.current(draftRef.current);
      });
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, []);

  return (
    <>
      {name ? <input ref={hiddenRef} type="hidden" name={name} value={value} /> : null}
      <Input
        {...rest}
        ref={visibleRef}
        name={undefined}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn("tabular-nums", className)}
        value={focused ? draft : displayFromCanonical(value, scale)}
        onFocus={(e) => {
          setFocused(true);
          const t = value.trim();
          setDraft(t ? formatDecimalEditBuffer(t, precision) : "");
          onFocus?.(e);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          try {
            const canonical = editRef.current.change(next, precisionRef.current);
            if (canonical != null) emitCanonical(canonical);
          } catch {
            /* incomplete token */
          }
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key === "Enter") commit(draft);
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(draft);
          onBlur?.(e);
        }}
      />
    </>
  );
}

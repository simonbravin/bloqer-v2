"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  DISPLAY_DECIMALS,
  formatDecimalEditBuffer,
  formatGroupedDecimal,
  roundToDecimals,
  tryParseUserDecimal,
} from "@bloqer/utils";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DecimalInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (canonical: string) => void;
  /** Fractional digits on blur / emit. Default 2 (D-053 display). Do not use type="number" for money/qty/%. */
  scale?: number;
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
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  useEffect(() => {
    if (!focused) setDraft(displayFromCanonical(value, scale));
  }, [value, scale, focused]);

  function emitCanonical(canonical: string) {
    if (hiddenRef.current) hiddenRef.current.value = canonical;
    onValueChangeRef.current(canonical);
  }

  function commit(raw: string) {
    const parsed = tryParseUserDecimal(raw, "commit");
    if (parsed == null) return;
    if (parsed === "") {
      emitCanonical("");
      setDraft("");
      return;
    }
    try {
      const rounded = roundToDecimals(parsed, scaleRef.current);
      emitCanonical(rounded);
      setDraft(formatGroupedDecimal(rounded, scaleRef.current));
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
          setDraft(t ? formatDecimalEditBuffer(t, scale) : "");
          onFocus?.(e);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          const parsed = tryParseUserDecimal(next, "live");
          if (parsed == null) return;
          if (parsed === "") {
            emitCanonical("");
            return;
          }
          try {
            emitCanonical(roundToDecimals(parsed, scaleRef.current));
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

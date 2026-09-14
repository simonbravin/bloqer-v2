"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ExpandableNotesFieldProps = Omit<
  React.ComponentProps<"textarea">,
  "rows" | "className" | "ref"
> & {
  label?: string;
  className?: string;
  /** Max height in px before internal scroll (default 160). */
  maxHeightPx?: number;
};

const fieldChrome =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/**
 * Single-line notes field that grows with content / focus (invoice forms).
 * Collapses toward one line when empty and blurred.
 */
export function ExpandableNotesField({
  id = "notes",
  name = "notes",
  label = "Notas (opcional)",
  defaultValue,
  value,
  onChange,
  onFocus,
  onBlur,
  className,
  maxHeightPx = 160,
  disabled,
  placeholder = "Agregar una nota…",
  ...rest
}: ExpandableNotesFieldProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = React.useState(false);
  const isControlled = value !== undefined;

  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, 40), maxHeightPx);
    el.style.height = `${next}px`;
  }, [maxHeightPx]);

  React.useLayoutEffect(() => {
    resize();
  }, [resize, value, defaultValue, focused]);

  return (
    <div className={cn("space-y-1", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <textarea
        {...rest}
        ref={ref}
        id={id}
        name={name}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        {...(isControlled
          ? { value: value as string | number | readonly string[] }
          : { defaultValue })}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
          requestAnimationFrame(resize);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
          requestAnimationFrame(resize);
        }}
        className={cn(fieldChrome, "min-h-10 resize-none overflow-y-auto py-2 leading-snug")}
      />
    </div>
  );
}

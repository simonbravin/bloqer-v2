"use client";

import { useCallback, useEffect, useId, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { Bold, List, ListOrdered } from "lucide-react";
import { isRichNoteEmpty, normalizeRichNote } from "@bloqer/utils";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  id?: string;
  defaultValue?: string | null;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

function runEditorCommand(command: string) {
  document.execCommand(command, false);
}

function queryCommandOn(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

export function RichNoteEditor({
  name,
  id,
  defaultValue,
  disabled,
  placeholder = "Tareas del día, pendientes, problemas…",
  "aria-label": ariaLabel,
}: Props) {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const appliedDefault = useRef<string | null | undefined | symbol>(Symbol("unset"));
  const initialHtml = normalizeRichNote(defaultValue) ?? "";
  const [empty, setEmpty] = useState(() => isRichNoteEmpty(defaultValue));
  const [boldOn, setBoldOn] = useState(false);
  const [ulOn, setUlOn] = useState(false);
  const [olOn, setOlOn] = useState(false);

  const syncFromEditor = useCallback(() => {
    const raw = editorRef.current?.innerHTML ?? "";
    const next = normalizeRichNote(raw) ?? "";
    if (hiddenRef.current) hiddenRef.current.value = next;
    setEmpty(isRichNoteEmpty(raw));
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (appliedDefault.current === defaultValue) return;
    appliedDefault.current = defaultValue;
    const initial = normalizeRichNote(defaultValue) ?? "";
    if (el.innerHTML !== initial) el.innerHTML = initial;
    if (hiddenRef.current) hiddenRef.current.value = initial;
    setEmpty(isRichNoteEmpty(defaultValue));
  }, [defaultValue]);

  useEffect(() => {
    const form = editorRef.current?.closest("form");
    if (!form) return;
    const onSubmit = () => syncFromEditor();
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [syncFromEditor]);

  const refreshToolbar = useCallback(() => {
    if (disabled) return;
    setBoldOn(queryCommandOn("bold"));
    setUlOn(queryCommandOn("insertUnorderedList"));
    setOlOn(queryCommandOn("insertOrderedList"));
  }, [disabled]);

  const exec = useCallback(
    (command: string) => {
      if (disabled) return;
      editorRef.current?.focus();
      runEditorCommand(command);
      syncFromEditor();
      refreshToolbar();
    },
    [disabled, refreshToolbar, syncFromEditor],
  );

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (disabled) return;
      const pastedHtml = event.clipboardData.getData("text/html");
      const pastedText = event.clipboardData.getData("text/plain");
      const normalized = normalizeRichNote(pastedHtml) ?? normalizeRichNote(pastedText);
      if (!normalized) return;
      const inserted = document.execCommand("insertHTML", false, normalized);
      if (!inserted) document.execCommand("insertText", false, pastedText);
      syncFromEditor();
    },
    [disabled, syncFromEditor],
  );

  return (
    <div className={cn("rounded-md border border-input bg-background", disabled && "opacity-50")}>
      <input type="hidden" name={name} ref={hiddenRef} defaultValue={initialHtml} />
      <div
        role="toolbar"
        aria-label="Formato de notas"
        className="flex flex-wrap gap-0.5 border-b border-input bg-muted/40 px-1 py-1"
      >
        <ToolbarButton
          label="Negrita"
          pressed={boldOn}
          disabled={disabled}
          onClick={() => exec("bold")}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Viñetas"
          pressed={ulOn}
          disabled={disabled}
          onClick={() => exec("insertUnorderedList")}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Numeración"
          pressed={olOn}
          disabled={disabled}
          onClick={() => exec("insertOrderedList")}
        >
          <ListOrdered />
        </ToolbarButton>
      </div>
      <div className="relative">
        {empty ? (
          <p className="pointer-events-none absolute left-3 top-2 text-base text-muted-foreground md:text-sm">
            {placeholder}
          </p>
        ) : null}
        <div
          id={editorId}
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel ?? placeholder}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          contentEditable={!disabled}
          suppressContentEditableWarning
          className={cn(
            "min-h-[120px] px-3 py-2 text-base outline-none md:text-sm",
            "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
            "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_p]:my-0 [&_p+p]:mt-2 [&_strong]:font-semibold [&_b]:font-semibold",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          onInput={() => {
            syncFromEditor();
            refreshToolbar();
          }}
          onKeyUp={refreshToolbar}
          onMouseUp={refreshToolbar}
          onFocus={refreshToolbar}
          onBlur={syncFromEditor}
          onPaste={onPaste}
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-muted-foreground md:size-8",
        "hover:bg-background hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-4",
        pressed && "bg-background text-foreground shadow-sm",
      )}
    >
      {children}
    </button>
  );
}

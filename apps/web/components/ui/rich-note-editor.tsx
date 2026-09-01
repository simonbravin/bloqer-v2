"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from "react";
import { Bold, List, ListOrdered } from "lucide-react";
import { isRichNoteEmpty, normalizeRichNote, resolveRichNoteSubmitValue } from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { textareaClassName } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  id?: string;
  defaultValue?: string | null;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

export type RichNoteEditorHandle = {
  /** Flush contenteditable → hidden field. Call before FormData on programmatic submit. */
  sync: () => string;
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

export const RichNoteEditor = forwardRef<RichNoteEditorHandle, Props>(function RichNoteEditor(
  {
    name,
    id,
    defaultValue,
    disabled,
    placeholder = "Tareas del día, pendientes, problemas…",
    "aria-label": ariaLabel,
  },
  ref,
) {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const editorRef = useRef<HTMLDivElement>(null);
  const appliedDefault = useRef<string | null | undefined | symbol>(Symbol("unset"));
  const initialHtml = normalizeRichNote(defaultValue) ?? "";
  const serializedRef = useRef(initialHtml);
  const [serialized, setSerialized] = useState(initialHtml);
  const [empty, setEmpty] = useState(() => isRichNoteEmpty(defaultValue));
  const [boldOn, setBoldOn] = useState(false);
  const [ulOn, setUlOn] = useState(false);
  const [olOn, setOlOn] = useState(false);

  const applySerialized = useCallback((next: string, rawForEmptyCheck: string) => {
    serializedRef.current = next;
    setSerialized(next);
    setEmpty(isRichNoteEmpty(rawForEmptyCheck));
  }, []);

  const flushEditor = useCallback((): string => {
    const raw = editorRef.current?.innerHTML ?? "";
    const next = normalizeRichNote(raw) ?? "";
    applySerialized(next, raw);
    return next;
  }, [applySerialized]);

  const syncForSubmit = useCallback((): string => {
    const raw = editorRef.current?.innerHTML ?? "";
    const next = resolveRichNoteSubmitValue(raw, serializedRef.current);
    applySerialized(next, next || raw);
    return next;
  }, [applySerialized]);

  useImperativeHandle(ref, () => ({ sync: syncForSubmit }), [syncForSubmit]);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (appliedDefault.current === defaultValue) return;
    appliedDefault.current = defaultValue;
    const initial = normalizeRichNote(defaultValue) ?? "";
    if (el.innerHTML !== initial) el.innerHTML = initial;
    applySerialized(initial, initial);
  }, [applySerialized, defaultValue]);

  useEffect(() => {
    const form = editorRef.current?.closest("form");
    if (!form) return;
    const onSubmit = () => syncForSubmit();
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [syncForSubmit]);

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
      flushEditor();
      refreshToolbar();
    },
    [disabled, flushEditor, refreshToolbar],
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
      flushEditor();
    },
    [disabled, flushEditor],
  );

  return (
    <div className={cn("space-y-1", disabled && "pointer-events-none opacity-50")}>
      <div role="toolbar" aria-label="Formato de notas" className="flex flex-wrap gap-0.5">
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
      <div
        className={cn(
          textareaClassName,
          "flex-col p-0 [outline:none] focus-visible:ring-0 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        )}
      >
        <input type="hidden" name={name} value={serialized} readOnly />
        <div className="relative min-h-[80px]">
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
              "min-h-[80px] px-3 py-2 [outline:none]",
              "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
              "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
              "[&_p]:my-0 [&_p+p]:mt-2 [&_strong]:font-semibold [&_b]:font-semibold",
            )}
            onInput={() => {
              flushEditor();
              refreshToolbar();
            }}
            onKeyUp={refreshToolbar}
            onMouseUp={refreshToolbar}
            onFocus={refreshToolbar}
            onBlur={flushEditor}
            onPaste={onPaste}
          />
        </div>
      </div>
    </div>
  );
});

RichNoteEditor.displayName = "RichNoteEditor";

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
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "size-9 text-muted-foreground md:size-8",
        pressed && "bg-accent text-foreground",
      )}
    >
      {children}
    </Button>
  );
}

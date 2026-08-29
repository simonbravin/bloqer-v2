"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

type Props = React.ComponentProps<typeof Textarea>;

/**
 * One-line textarea that grows with content and still offers the resize handle.
 */
export const AutoGrowTextarea = React.forwardRef<HTMLTextAreaElement, Props>(
  function AutoGrowTextarea({ className, onInput, onChange, ...props }, forwardedRef) {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const assignRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const fit = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    React.useLayoutEffect(() => {
      fit();
    }, [fit, props.value, props.defaultValue]);

    React.useEffect(() => {
      const el = innerRef.current;
      const parent = el?.parentElement;
      if (!parent || typeof ResizeObserver === "undefined") return;
      let lastWidth = parent.clientWidth;
      const ro = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width == null || width === lastWidth) return;
        lastWidth = width;
        fit();
      });
      ro.observe(parent);
      window.addEventListener("resize", fit);
      return () => {
        ro.disconnect();
        window.removeEventListener("resize", fit);
      };
    }, [fit]);

    return (
      <Textarea
        {...props}
        ref={assignRef}
        rows={1}
        onInput={(event) => {
          fit();
          onInput?.(event);
        }}
        onChange={(event) => {
          fit();
          onChange?.(event);
        }}
        className={cn(
          "min-h-9 resize-y overflow-y-auto py-2 scroll-mb-24 md:scroll-mb-0",
          className,
        )}
      />
    );
  },
);
AutoGrowTextarea.displayName = "AutoGrowTextarea";

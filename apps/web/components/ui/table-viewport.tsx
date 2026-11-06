"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function TableViewport({
  children,
  label,
  labelledBy,
}: {
  children: ReactNode;
  label?: string;
  labelledBy?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      setOverflowing(viewport.clientWidth > 0 && viewport.scrollWidth > viewport.clientWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={viewportRef}
      data-table-viewport=""
      className="relative w-full min-w-0 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      tabIndex={overflowing ? 0 : undefined}
      role={overflowing ? "region" : undefined}
      aria-labelledby={overflowing ? labelledBy : undefined}
      aria-label={overflowing && !labelledBy ? label ?? "Tabla con desplazamiento horizontal" : undefined}
    >
      {children}
    </div>
  );
}

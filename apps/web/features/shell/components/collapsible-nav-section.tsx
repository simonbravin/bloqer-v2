"use client";

import { ChevronRight } from "lucide-react";
import { NavItem } from "@/features/shell/components/nav-item";
import { cn } from "@/lib/utils";

export type CollapsibleNavLink = { label: string; href: string; matchExact?: boolean };

interface CollapsibleNavSectionProps {
  title: string;
  sectionIndex: number;
  open: boolean;
  onToggle: () => void;
  items: CollapsibleNavLink[];
}

export function CollapsibleNavSection({
  title,
  sectionIndex,
  open,
  onToggle,
  items,
}: CollapsibleNavSectionProps) {
  const panelId = `nav-section-${sectionIndex}`;
  return (
    <div className="rounded-md">
      <button
        type="button"
        id={`${panelId}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-150",
          "hover:bg-muted/60 hover:text-foreground",
          open && "bg-muted/30 text-foreground",
        )}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform duration-200",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={`${panelId}-trigger`}
          className="ml-1.5 mt-0.5 flex flex-col gap-0.5 border-l border-border/55 pl-3"
        >
          {items.map((item) => (
            <NavItem
              key={`${item.label}-${item.href}`}
              href={item.href}
              label={item.label}
              matchExact={item.matchExact}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

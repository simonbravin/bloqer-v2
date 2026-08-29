import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type ReportHubCard = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  available: boolean;
  badge?: string;
};

export type ReportHubSection = {
  title: string;
  description: string;
  cards: ReportHubCard[];
};

function ReportCardView({ card }: { card: ReportHubCard }) {
  return (
    <Card
      className={card.available ? "transition-shadow hover:shadow-md" : "opacity-50"}
    >
      {card.available ? (
        <Link href={card.href} className="block h-full">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-primary">{card.icon}</div>
            <CardTitle className="text-base">{card.title}</CardTitle>
            <CardDescription className="text-sm">{card.description}</CardDescription>
            {card.badge ? (
              <span className="inline-block text-xs text-muted-foreground">{card.badge}</span>
            ) : null}
          </CardHeader>
        </Link>
      ) : (
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">{card.icon}</div>
          <CardTitle className="text-base">{card.title}</CardTitle>
          <CardDescription className="text-sm">{card.description}</CardDescription>
          <span className="text-xs text-muted-foreground">Sin permisos o módulo deshabilitado</span>
        </CardHeader>
      )}
    </Card>
  );
}

/** Shared grouped layout for project and company report hubs. */
export function ReportsHubSections({ sections }: { sections: ReportHubSection[] }) {
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold tracking-tight">{section.title}</h2>
            <p className="text-xs text-muted-foreground">{section.description}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {section.cards.map((card) => (
              <ReportCardView key={card.title} card={card} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

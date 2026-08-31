import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type InventarioHubCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export function InventarioHubCards({ cards }: { cards: InventarioHubCard[] }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        cards.length >= 3 && "lg:grid-cols-3",
      )}
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.href}
            className="transition-colors hover:bg-accent/40 hover:shadow-md"
          >
            <Link
              href={card.href}
              className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h2 className="text-base font-semibold leading-none tracking-tight">
                    {card.title}
                  </h2>
                </div>
                <CardDescription className="text-sm">{card.description}</CardDescription>
              </CardHeader>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}

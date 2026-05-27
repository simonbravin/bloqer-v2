import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Rich KPI / panel card: same shell as KpiStatCard, custom body (lists, progress, etc.). */
export function KpiPanelCard({
  label,
  children,
  href,
  footerLabel,
  className,
}: {
  label: string;
  children: React.ReactNode;
  href?: string;
  footerLabel?: string;
  className?: string;
}) {
  const inner = (
    <Card
      className={cn(
        "flex h-full min-h-[8.5rem] flex-col rounded-xl border border-border bg-card shadow-sm transition-shadow duration-200",
        className,
      )}
    >
      <CardHeader className="flex-none space-y-0 pb-0 pt-5">
        <CardTitle className="min-h-[2.5rem] text-sm font-medium leading-snug text-muted-foreground line-clamp-2">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end pb-3 pt-2">{children}</CardContent>
      {href && footerLabel ? (
        <CardFooter className="flex-none pt-0 pb-4">
          <Link
            href={href}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {footerLabel}
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );

  if (href && !footerLabel) {
    return (
      <Link
        href={href}
        className="block h-full rounded-xl outline-none ring-offset-background transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}

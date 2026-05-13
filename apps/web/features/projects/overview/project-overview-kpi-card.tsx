import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ProjectOverviewKpiCard({
  title,
  description,
  children,
  href,
  footerLabel,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  href?: string;
  footerLabel?: string;
  className?: string;
}) {
  return (
    <Card className={cn("h-full rounded-xl border bg-card shadow-sm transition-colors", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pb-3">{children}</CardContent>
      {href && footerLabel ? (
        <CardFooter className="pt-0">
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
}

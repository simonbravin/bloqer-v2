import Link from "next/link";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AuthCardProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  /** When false, logo is not a link (e.g. login). Default true → /login */
  logoHref?: string | null;
  className?: string;
};

export function AuthCard({
  title,
  description,
  children,
  logoHref = "/login",
  className,
}: AuthCardProps) {
  const logo = (
    <BloqerLogo
      priority
      className="h-12 max-w-[12.5rem] sm:h-11 dark:brightness-110"
    />
  );

  return (
    <Card
      className={cn(
        "w-full max-w-sm border-border/80 bg-card/95 shadow-md backdrop-blur-sm dark:border-border/60 dark:bg-card/90 dark:shadow-black/40",
        className,
      )}
    >
      <CardHeader className="space-y-4 text-center sm:text-left">
        <div className="flex justify-center sm:justify-start">
          {logoHref ? (
            <Link href={logoHref} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {logo}
            </Link>
          ) : (
            logo
          )}
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle>
          <CardDescription className="text-pretty">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

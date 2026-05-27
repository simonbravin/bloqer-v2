import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageBackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Button variant="ghost" size="sm" asChild className={cn("-ml-2 gap-1", className)}>
      <Link href={href}>
        <ChevronLeft className="size-4" aria-hidden />
        {label}
      </Link>
    </Button>
  );
}

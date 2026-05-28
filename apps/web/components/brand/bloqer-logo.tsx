import Image from "next/image";
import { cn } from "@/lib/utils";

/** Intrinsic size of `public/bloqer-logo.png` (cropped horizontal mark). */
const LOGO_WIDTH = 670;
const LOGO_HEIGHT = 225;

export function BloqerLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/bloqer-logo.png"
      alt="Bloqer"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority={priority}
      className={cn("h-10 w-auto max-w-full object-contain object-left", className)}
    />
  );
}

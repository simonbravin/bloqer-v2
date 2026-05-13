import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { isPlatformSuperadmin } from "@bloqer/services";

export default async function PlatformGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isPlatformSuperadmin(session.user.id))) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-muted/15 dark:bg-muted/5">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/90 px-4 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:px-6">
        <nav className="flex flex-wrap items-center gap-6 text-sm font-medium">
          <Link href="/platform" className="flex items-center gap-2 rounded-md text-foreground transition-colors hover:text-primary">
            <Image src="/bloqer-logo.png" alt="" width={100} height={28} className="h-6 w-auto object-contain" />
            <span className="font-semibold tracking-tight">Plataforma</span>
          </Link>
          <Link
            href="/platform/tenants"
            className="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            Tenants
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            Ir a la app
          </Link>
        </nav>
        <span className="max-w-[50%] truncate text-xs text-muted-foreground">{session.user.email}</span>
      </header>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

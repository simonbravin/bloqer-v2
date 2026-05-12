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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
        <nav className="flex flex-wrap items-center gap-6 text-sm font-medium">
          <Link href="/platform" className="flex items-center gap-2 text-foreground">
            <Image src="/bloqer-logo.png" alt="" width={100} height={28} className="h-6 w-auto object-contain" />
            <span>Plataforma</span>
          </Link>
          <Link href="/platform/tenants" className="text-muted-foreground hover:text-foreground">
            Tenants
          </Link>
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Ir a la app
          </Link>
        </nav>
        <span className="max-w-[50%] truncate text-xs text-muted-foreground">{session.user.email}</span>
      </header>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

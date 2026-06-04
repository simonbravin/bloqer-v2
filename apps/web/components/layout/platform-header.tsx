"use client";

import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import Link from "next/link";
import { ShellHeaderLeading } from "@/components/layout/sidebar-shell-context";
import { clearActiveTenantCookieAction } from "@/lib/auth-session-actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "U";
}

export function PlatformHeader({ user }: { user: Session["user"] }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/90 px-4 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:px-6">
      <ShellHeaderLeading>
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
          Consola de plataforma
        </p>
      </ShellHeaderLeading>
      <div className="flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" size="sm" asChild className="hidden text-muted-foreground sm:inline-flex">
          <Link href="/dashboard">Ir a la app</Link>
        </Button>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-transparent p-0.5 outline-none transition-colors hover:border-border hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "Usuario"} />
                <AvatarFallback className="text-xs font-medium">
                  {getInitials(user?.name, user?.email)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name ?? "Superadmin"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard">Ir a la app</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                void clearActiveTenantCookieAction().finally(() => {
                  void signOut({ callbackUrl: "/login" });
                });
              }}
            >
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

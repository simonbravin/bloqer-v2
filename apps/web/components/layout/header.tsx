"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import Link from "next/link";
import { Sun, Moon, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  user: Session["user"];
  notificationUnreadCount?: number;
  showPlatformLink?: boolean;
}

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

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      title="Cambiar tema"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

export function Header({ user, notificationUnreadCount = 0, showPlatformLink = false }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2">
        <Image
          src="/bloqer-logo.png"
          alt="Bloqer"
          width={120}
          height={32}
          className="h-6 w-auto object-contain object-left"
        />
        <span className="text-xs font-medium text-muted-foreground">2.0</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative h-8 w-8" asChild title="Notificaciones">
          <Link href="/notificaciones">
            <Bell className="h-4 w-4" />
            {notificationUnreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center px-1 text-[10px] leading-none"
              >
                {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
              </Badge>
            )}
          </Link>
        </Button>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "Usuario"} />
                <AvatarFallback className="text-xs">
                  {getInitials(user?.name, user?.email)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name ?? "Usuario"}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {showPlatformLink ? (
              <DropdownMenuItem asChild>
                <Link href="/platform">Plataforma</Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem>Perfil</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => signOut({ callbackUrl: "/login" })}
            >
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

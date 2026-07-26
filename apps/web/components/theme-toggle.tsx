"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9 shrink-0 border border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/50"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      title={mounted && resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}
      type="button"
      disabled={!mounted}
      aria-label="Cambiar tema"
    >
      <Sun className="absolute h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" aria-hidden />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" aria-hidden />
      <span className="sr-only">Cambiar tema</span>
    </Button>
  );
}

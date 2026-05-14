import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AppSessionProvider } from "@/components/providers/app-session-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bloqer",
  description: "ERP SaaS para empresas constructoras",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppSessionProvider>
            <Toaster richColors closeButton position="top-center" />
            {children}
          </AppSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

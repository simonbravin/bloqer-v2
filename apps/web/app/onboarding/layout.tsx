import { BloqerLogo } from "@/components/brand/bloqer-logo";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b bg-background px-6 py-4">
        <BloqerLogo priority className="h-8 max-w-[9.5rem]" />
      </header>
      <div className="flex flex-1 flex-col items-center px-4 py-10">{children}</div>
    </div>
  );
}

import Image from "next/image";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b bg-background px-6 py-4">
        <Image src="/bloqer-logo.png" alt="Bloqer" width={140} height={36} priority className="h-8 w-auto object-contain" />
      </header>
      <div className="flex flex-1 flex-col items-center px-4 py-10">{children}</div>
    </div>
  );
}

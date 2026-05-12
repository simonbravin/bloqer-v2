import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/40 p-4">
      <Image
        src="/bloqer-logo.png"
        alt="Bloqer"
        width={180}
        height={48}
        priority
        className="h-11 w-auto object-contain"
      />
      {children}
    </div>
  );
}

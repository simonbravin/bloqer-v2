import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { isPlatformSuperadmin } from "@bloqer/services";
import { PlatformShell } from "@/components/layout/platform-shell";

export default async function PlatformGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isPlatformSuperadmin(session.user.id))) redirect("/dashboard");

  return <PlatformShell user={session.user}>{children}</PlatformShell>;
}

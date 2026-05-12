import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { peekTenantInvitationForAcceptPage } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { acceptTenantInvitationAction } from "./actions";

interface PageProps {
  searchParams: Promise<{ token?: string; err?: string }>;
}

export default async function InvitacionesAceptarPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const token = (sp.token ?? "").trim();
  let errMsg: string | null = null;
  if (sp.err) {
    try {
      errMsg = decodeURIComponent(sp.err);
    } catch {
      errMsg = sp.err;
    }
  }

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">Invitación</h1>
        <p className="text-sm text-muted-foreground">Falta el enlace de invitación. Pedile al administrador que te lo reenvíe.</p>
        <Button variant="outline" asChild>
          <Link href="/login">Ir a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  const peek = await peekTenantInvitationForAcceptPage(token);
  if (!peek) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">Invitación no válida</h1>
        <p className="text-sm text-muted-foreground">El enlace expiró o ya no está disponible.</p>
        <Button variant="outline" asChild>
          <Link href="/login">Ir a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  const current = await getCurrentUser();
  const callbackUrl = `/invitaciones/aceptar?token=${encodeURIComponent(token)}`;

  if (!current?.session?.user?.id) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">Aceptar invitación</h1>
        <p className="text-sm text-muted-foreground">
          Para unirte a <span className="font-medium text-foreground">{peek.tenantName}</span>, iniciá sesión con la
          cuenta de <span className="font-medium text-foreground">{peek.email}</span>.
        </p>
        <Button asChild>
          <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Aceptar invitación</h1>
      <p className="text-sm text-muted-foreground">
        Vas a unirte a <span className="font-medium text-foreground">{peek.tenantName}</span> como{" "}
        <span className="font-medium text-foreground">{peek.email}</span>.
      </p>
      {errMsg ? (
        <p className="text-sm text-destructive" role="alert">
          {errMsg}
        </p>
      ) : null}
      <form action={acceptTenantInvitationAction} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" className="w-full">
          Confirmar y unirme
        </Button>
      </form>
    </div>
  );
}

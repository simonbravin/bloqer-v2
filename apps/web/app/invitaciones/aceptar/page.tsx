import Link from "next/link";
import { InvitationAccountSwitch } from "@/features/auth/components/invitation-account-switch";
import { InvitationLoginLink } from "@/features/auth/components/invitation-login-link";
import { getCurrentUser } from "@/lib/auth";
import { buildInvitationAcceptCallbackUrl, invitationEmailsMatch } from "@/lib/invitation-auth";
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
  const callbackUrl = buildInvitationAcceptCallbackUrl(token);

  if (!current?.session?.user?.id) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">Aceptar invitación</h1>
        <p className="text-sm text-muted-foreground">
          Para unirte a <span className="font-medium text-foreground">{peek.tenantName}</span>, iniciá sesión con la
          cuenta de <span className="font-medium text-foreground">{peek.email}</span>.
        </p>
        <InvitationLoginLink callbackUrl={callbackUrl} invitedEmail={peek.email} />
      </div>
    );
  }

  const sessionEmail = current.session.user.email ?? "";
  const emailMatches = invitationEmailsMatch(sessionEmail, peek.email);

  if (!emailMatches) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">Cambiar cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Invitación a <span className="font-medium text-foreground">{peek.tenantName}</span>.
        </p>
        <InvitationAccountSwitch
          invitedEmail={peek.email}
          currentEmail={sessionEmail || "otra cuenta"}
          callbackUrl={callbackUrl}
        />
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

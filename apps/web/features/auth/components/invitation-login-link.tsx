import Link from "next/link";
import { buildInvitationLoginHref } from "@/lib/invitation-auth";
import { Button } from "@/components/ui/button";

type InvitationLoginLinkProps = {
  callbackUrl: string;
  invitedEmail: string;
};

export function InvitationLoginLink({ callbackUrl, invitedEmail }: InvitationLoginLinkProps) {
  return (
    <Button asChild className="w-full">
      <Link href={buildInvitationLoginHref(callbackUrl, invitedEmail)}>
        Iniciar sesión con {invitedEmail}
      </Link>
    </Button>
  );
}

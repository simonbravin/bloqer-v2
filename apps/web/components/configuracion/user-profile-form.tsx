"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { updateMyUserProfileSchema, type UpdateMyUserProfileInput } from "@bloqer/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyUserProfileAction } from "@/app/(app)/configuracion/profile-actions";

type Props = {
  defaultName: string | null;
  email: string;
};

export function UserProfileForm({ defaultName, email }: Props) {
  const router = useRouter();
  const { update } = useSession();

  const form = useForm<UpdateMyUserProfileInput>({
    resolver: zodResolver(updateMyUserProfileSchema),
    defaultValues: { name: defaultName ?? "" },
  });

  async function onSubmit(data: UpdateMyUserProfileInput) {
    const fd = new FormData();
    fd.set("name", data.name);
    const res = await updateMyUserProfileAction(fd);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    await update({ name: data.name });
    toast.success("Perfil guardado.");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-md gap-4">
      <div className="grid gap-1">
        <Label htmlFor="profile-name">Nombre</Label>
        <Input id="profile-name" autoComplete="name" {...form.register("name")} />
        {form.formState.errors.name?.message ? (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        ) : null}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="profile-email">Correo</Label>
        <Input id="profile-email" type="email" value={email} readOnly className="bg-muted/50" />
        <p className="text-xs text-muted-foreground">El correo no se puede cambiar desde acá.</p>
      </div>
      <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

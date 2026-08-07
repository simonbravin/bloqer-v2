"use client";

import { useEffect, useState } from "react";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  hasLogo: boolean;
  logoVersion: string | null;
  uploadAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
};

export function TenantLogoSettings({
  hasLogo,
  logoVersion,
  uploadAction,
  removeAction,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentLogoSrc = logoVersion
    ? `/api/tenant/logo?v=${encodeURIComponent(logoVersion)}`
    : "/api/tenant/logo";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "flex h-14 w-[9.5rem] items-center justify-center rounded-md border border-border/80 bg-muted/40 px-2",
          )}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Vista previa" className="h-8 max-w-full object-contain object-left" />
          ) : hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated tenant logo proxy
            <img
              src={currentLogoSrc}
              alt="Logo actual"
              className="h-8 max-w-full object-contain object-left"
            />
          ) : (
            <BloqerLogo className="h-8 max-w-[9.5rem]" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {hasLogo
            ? "Logo actual de tu empresa (vista previa del menú)."
            : "Sin logo propio: se muestra el de Bloqer."}{" "}
          Preferí una versión <span className="font-medium">horizontal</span> (PNG, JPEG o WebP,
          máx. 2 MB).
        </p>
      </div>

      <form action={uploadAction} className="grid max-w-lg gap-3">
        <div className="space-y-2">
          <Label htmlFor="logo">Subir logo</Label>
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setPreviewUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return file ? URL.createObjectURL(file) : null;
              });
              setFileName(file?.name ?? null);
            }}
          />
          {fileName ? (
            <p className="text-xs text-muted-foreground">Seleccionado: {fileName}</p>
          ) : null}
        </div>
        <Button type="submit" size="sm" className="w-fit">
          Guardar logo
        </Button>
      </form>

      {hasLogo ? (
        <form action={removeAction}>
          <Button type="submit" size="sm" variant="outline" className="w-fit">
            Quitar logo
          </Button>
        </form>
      ) : null}
    </div>
  );
}

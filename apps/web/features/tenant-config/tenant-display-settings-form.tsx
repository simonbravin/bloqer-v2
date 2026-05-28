"use client";

import { useState } from "react";
import type { TenantPrimaryCompanyView, TenantSettingsView } from "@bloqer/services";
import { formatCurrencyLabel } from "@bloqer/utils";
import { CurrencySelect } from "@/components/ui/currency-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "AR", label: "Argentina" },
  { value: "UY", label: "Uruguay" },
  { value: "PY", label: "Paraguay" },
  { value: "CL", label: "Chile" },
  { value: "BO", label: "Bolivia" },
  { value: "BR", label: "Brasil" },
  { value: "MX", label: "México" },
  { value: "CO", label: "Colombia" },
  { value: "PE", label: "Perú" },
  { value: "EC", label: "Ecuador" },
  { value: "US", label: "Estados Unidos" },
  { value: "ES", label: "España" },
];

const selectClassName = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

type Props = {
  tenant: Pick<TenantSettingsView, "name" | "timezone" | "baseCurrency">;
  company: TenantPrimaryCompanyView | null;
  action: (formData: FormData) => void | Promise<void>;
};

export function TenantDisplaySettingsForm({ tenant, company, action }: Props) {
  const [baseCurrency, setBaseCurrency] = useState(tenant.baseCurrency);

  return (
    <form action={action} className="grid max-w-lg gap-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Visualización</h3>
          <p className="text-xs text-muted-foreground">
            El nombre a mostrar aparece en la app; la razón social y el CUIT no se modifican acá.
          </p>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="name">Nombre a mostrar</Label>
          <Input
            id="name"
            name="name"
            defaultValue={tenant.name}
            maxLength={120}
            required
            placeholder="Ej. Bravin Group"
          />
          {company?.legalName && company.legalName !== tenant.name ? (
            <p className="text-xs text-muted-foreground">
              Razón social registrada: <span className="font-medium">{company.legalName}</span>
            </p>
          ) : null}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="timezone">Zona horaria</Label>
          <Input
            id="timezone"
            name="timezone"
            defaultValue={tenant.timezone}
            maxLength={64}
            required
            placeholder="America/Argentina/Buenos_Aires"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="baseCurrency">Moneda base</Label>
          <input type="hidden" name="baseCurrency" value={baseCurrency} />
          <CurrencySelect
            id="baseCurrency"
            value={baseCurrency}
            onValueChange={setBaseCurrency}
          />
          <p className="text-xs text-muted-foreground">
            Actual: {formatCurrencyLabel(baseCurrency)}
          </p>
        </div>
      </div>

      {company ? (
        <div className="space-y-4 border-t border-border/60 pt-4">
          <div>
            <h3 className="text-sm font-semibold">Contacto de la empresa</h3>
            <p className="text-xs text-muted-foreground">
              Dirección y teléfono de la empresa principal del tenant. CUIT y razón social son solo lectura.
            </p>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              name="address"
              defaultValue={company.address ?? ""}
              maxLength={500}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" name="city" defaultValue={company.city ?? ""} maxLength={120} required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="country">País</Label>
              <select
                id="country"
                name="country"
                className={selectClassName}
                defaultValue={company.country}
                required
              >
                {COUNTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={company.phone ?? ""}
              maxLength={40}
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="website">Sitio web (opcional)</Label>
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={company.website ?? ""}
              maxLength={512}
              placeholder="https://"
            />
          </div>
        </div>
      ) : null}

      <Button type="submit" size="sm" className="w-fit">
        Guardar cambios
      </Button>
    </form>
  );
}

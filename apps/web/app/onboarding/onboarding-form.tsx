"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { completeOnboardingAction, type OnboardingFormState } from "./actions";

const selectClassName = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

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

const initialState: OnboardingFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creando…" : "Crear espacio y continuar"}
    </Button>
  );
}

interface OnboardingFormProps {
  userEmail: string;
}

export function OnboardingForm({ userEmail }: OnboardingFormProps) {
  const [state, formAction] = useFormState(completeOnboardingAction, initialState);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Datos de la empresa</CardTitle>
        <CardDescription>
          {userEmail ? (
            <>
              Vas a crear el tenant como <span className="font-medium text-foreground">{userEmail}</span>.
            </>
          ) : (
            "Iniciaste sesión correctamente."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="displayName">Nombre para mostrar</Label>
            <Input id="displayName" name="displayName" required autoComplete="organization" placeholder="Ej. Constructora Sur" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="legalName">Razón social</Label>
            <Input id="legalName" name="legalName" required placeholder="Nombre legal registrado" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="taxId">CUIT / RUC / identificación fiscal</Label>
            <Input id="taxId" name="taxId" required placeholder="Sin guiones o con guiones, según aplique" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <select id="country" name="country" className={selectClassName} defaultValue="AR" required>
                {COUNTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" name="city" required autoComplete="address-level2" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Textarea id="address" name="address" required rows={3} placeholder="Calle, número, piso, CP" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" name="phone" type="tel" required autoComplete="tel" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Sitio web (opcional)</Label>
            <Input id="website" name="website" type="text" placeholder="https://…" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="industry">Rubro / industria (opcional)</Label>
              <Input id="industry" name="industry" placeholder="Construcción civil" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companySize">Tamaño aproximado (opcional)</Label>
              <select id="companySize" name="companySize" className={selectClassName} defaultValue="">
                <option value="">—</option>
                <option value="1-10">1 a 10 personas</option>
                <option value="11-50">11 a 50</option>
                <option value="51-200">51 a 200</option>
                <option value="201+">Más de 200</option>
              </select>
            </div>
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}

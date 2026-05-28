import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

interface CompanyOnboardingFieldsProps {
  showOwnerEmail?: boolean;
  ownerEmailDefault?: string;
}

export function CompanyOnboardingFields({
  showOwnerEmail = false,
  ownerEmailDefault = "",
}: CompanyOnboardingFieldsProps) {
  return (
    <>
      {showOwnerEmail ? (
        <div className="space-y-2">
          <Label htmlFor="ownerEmail">Email del administrador (OWNER)</Label>
          <Input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            required
            autoComplete="email"
            defaultValue={ownerEmailDefault}
            placeholder="dueño@empresa.com"
          />
          <p className="text-xs text-muted-foreground">
            Recibirá una invitación para aceptar y administrar la organización.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="displayName">Nombre para mostrar</Label>
        <Input id="displayName" name="displayName" required autoComplete="organization" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="legalName">Razón social</Label>
        <Input id="legalName" name="legalName" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="taxId">CUIT / identificación fiscal</Label>
        <Input id="taxId" name="taxId" required />
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
        <Textarea id="address" name="address" required rows={3} />
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
          <Label htmlFor="industry">Rubro (opcional)</Label>
          <Input id="industry" name="industry" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="companySize">Tamaño (opcional)</Label>
          <select id="companySize" name="companySize" className={selectClassName} defaultValue="">
            <option value="">—</option>
            <option value="1-10">1 a 10</option>
            <option value="11-50">11 a 50</option>
            <option value="51-200">51 a 200</option>
            <option value="201+">Más de 200</option>
          </select>
        </div>
      </div>
      {showOwnerEmail ? (
        <div className="space-y-2">
          <Label htmlFor="invitationExpiresInDays">Vencimiento invitación (días)</Label>
          <Input
            id="invitationExpiresInDays"
            name="invitationExpiresInDays"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            className="max-w-[120px]"
          />
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  createContactSchema,
  updateContactSchema,
  type CreateContactInput,
} from "@bloqer/validators";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IvaConditionSelect } from "@/features/finance/components/invoice-letter-fields";
import type { IvaConditionCode } from "@bloqer/domain";

type ContactFormValues = Omit<CreateContactInput, "initialRole"> & {
  initialRole?: CreateContactInput["initialRole"];
};

interface ContactFormProps {
  mode?: "create" | "edit";
  onSubmit: (data: CreateContactInput) => Promise<{ id?: string; ok?: true; error?: string }>;
  defaultValues?: Partial<CreateContactInput>;
  submitLabel?: string;
  successRedirect?: string;
}

const TAX_ID_TYPE_OPTIONS = [
  { value: "CUIT", label: "CUIT" },
  { value: "CUIL", label: "CUIL" },
  { value: "CDI", label: "CDI" },
  { value: "FOREIGN", label: "ID Extranjero" },
  { value: "FINAL_CONSUMER", label: "Consumidor Final" },
];

const ROLE_OPTIONS = [
  { value: "CLIENT", label: "Cliente" },
  { value: "SUPPLIER", label: "Proveedor" },
  { value: "SUBCONTRACTOR", label: "Subcontratista" },
  { value: "EMPLOYEE", label: "Empleado" },
  { value: "OTHER", label: "Otro" },
] as const;

const editContactFormSchema = updateContactSchema.extend({
  legalName: createContactSchema.shape.legalName,
});

export function ContactForm({
  mode = "create",
  onSubmit,
  defaultValues,
  submitLabel = "Crear contacto",
  successRedirect,
}: ContactFormProps) {
  const router = useRouter();
  const isCreate = mode === "create";
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(isCreate ? createContactSchema : editContactFormSchema) as Resolver<ContactFormValues>,
    defaultValues: {
      country: "AR",
      ...defaultValues,
    },
  });

  const handleSubmit = async (data: ContactFormValues) => {
    try {
      const result = await onSubmit(data as CreateContactInput);
      if (result.error) {
        form.setError("root", { message: result.error });
      } else {
        router.push(successRedirect ?? (result.id ? `/directorio/${result.id}` : "/directorio"));
      }
    } catch {
      form.setError("root", { message: "Error inesperado al guardar" });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {form.formState.errors.root && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {form.formState.errors.root.message}
          </div>
        )}

        {isCreate && (
          <FormField
            control={form.control}
            name="initialRole"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rol *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ROLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Definí si este contacto es cliente, proveedor, subcontratista, empleado u otro. Después podés asignarle más de un rol
                  desde su ficha.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="legalName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razón social *</FormLabel>
                <FormControl>
                  <Input placeholder="Empresa S.A." {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fantasyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre fantasía</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre comercial" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="taxIdType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de ID fiscal</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TAX_ID_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="taxId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CUIT / CUIL / ID fiscal</FormLabel>
                <FormControl>
                  <Input placeholder="20-12345678-9" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="ivaCondition"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <IvaConditionSelect
                  id="ivaCondition"
                  value={(field.value as IvaConditionCode | null | undefined) ?? null}
                  onValueChange={(v) => field.onChange(v)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="contacto@empresa.com" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <Input placeholder="+54 11 1234-5678" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Dirección</FormLabel>
                <FormControl>
                  <Input placeholder="Av. Corrientes 1234" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ciudad</FormLabel>
                <FormControl>
                  <Input placeholder="Buenos Aires" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="province"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provincia</FormLabel>
                <FormControl>
                  <Input placeholder="Buenos Aires" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>País (ISO)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="AR"
                    maxLength={2}
                    {...field}
                    value={field.value ?? "AR"}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Información adicional..."
                  className="resize-none"
                  rows={3}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Guardando..." : submitLabel}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}

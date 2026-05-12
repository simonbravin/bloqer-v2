"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createContactSchema, type CreateContactInput } from "@bloqer/validators";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
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

interface ContactFormProps {
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
];

export function ContactForm({ onSubmit, defaultValues, submitLabel = "Crear contacto", successRedirect }: ContactFormProps) {
  const router = useRouter();
  const form = useForm<CreateContactInput>({
    resolver: zodResolver(createContactSchema),
    defaultValues: defaultValues ?? {},
  });

  const handleSubmit = async (data: CreateContactInput) => {
    const result = await onSubmit(data);
    if (result.error) {
      form.setError("root", { message: result.error });
    } else {
      router.push(successRedirect ?? (result.id ? `/directorio/${result.id}` : "/directorio"));
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

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="legalName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razón social *</FormLabel>
                <FormControl>
                  <Input placeholder="Empresa S.A." {...field} />
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
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
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
            name="initialRole"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rol inicial</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
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

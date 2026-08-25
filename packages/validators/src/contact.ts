import { z } from "zod";
import { moneyAmountString, optionalMoneyAmountString } from "./money";

export const contactRoleTypeSchema = z.enum([
  "CLIENT",
  "SUPPLIER",
  "SUBCONTRACTOR",
  "EMPLOYEE",
  "OTHER",
]);

export const taxIdTypeSchema = z.enum([
  "CUIT",
  "CUIL",
  "CDI",
  "FOREIGN",
  "FINAL_CONSUMER",
]);

/** Condición frente al IVA — [D-084]. */
export const ivaConditionSchema = z.enum([
  "RESPONSIBLE_INSCRIPTO",
  "MONOTAX",
  "EXEMPT",
  "FINAL_CONSUMER",
  "NOT_CATEGORIZED",
  "FOREIGN",
]);

/** Letra de comprobante A/B/C/E — [D-084]. */
export const invoiceLetterSchema = z.enum(["A", "B", "C", "E"]);

/** Blank optional text → `null` so CUIT unique (`tenantId, taxId`) is not occupied by `""`. */
function blankToNull(v: unknown) {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === "string" && v.trim() === "")) return null;
  return v;
}

const optionalNullableText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());

const optionalNullableEmail = z.preprocess(
  blankToNull,
  z.string().trim().email("Email inválido").max(255).nullable().optional(),
);

/** Empty country is omitted so Prisma `@default("AR")` still applies on create. */
function blankToUndefined(v: unknown) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

export const createContactSchema = z.object({
  legalName: z.string().trim().min(1, "La razón social es obligatoria").max(255),
  fantasyName: optionalNullableText(255),
  taxId: optionalNullableText(20),
  taxIdType: taxIdTypeSchema.optional(),
  ivaCondition: ivaConditionSchema.optional().nullable(),
  address: optionalNullableText(500),
  city: optionalNullableText(100),
  province: optionalNullableText(100),
  country: z.preprocess(blankToUndefined, z.string().trim().length(2).toUpperCase().optional()),
  phone: optionalNullableText(50),
  email: optionalNullableEmail,
  notes: optionalNullableText(2000),
  initialRole: z.enum(contactRoleTypeSchema.options, {
    required_error: "Elegí un rol",
    invalid_type_error: "Elegí un rol",
  }),
});

export const updateContactSchema = z.object({
  legalName: z.string().trim().min(1).max(255).optional(),
  fantasyName: optionalNullableText(255),
  taxId: optionalNullableText(20),
  taxIdType: taxIdTypeSchema.optional(),
  ivaCondition: ivaConditionSchema.optional().nullable(),
  address: optionalNullableText(500),
  city: optionalNullableText(100),
  province: optionalNullableText(100),
  country: z.preprocess(blankToUndefined, z.string().trim().length(2).toUpperCase().optional()),
  phone: optionalNullableText(50),
  email: optionalNullableEmail,
  notes: optionalNullableText(2000),
});

export const assignContactRoleSchema = z.object({
  role: contactRoleTypeSchema,
  notes: z.string().max(500).optional(),
  // Profile-specific fields
  paymentTermsDays: z.number().int().min(0).optional(),
  creditLimit: optionalMoneyAmountString,
  defaultCurrency: z.string().length(3).optional(),
  bankAccount: z.string().max(50).optional(),
  specialty: z.string().max(255).optional(),
});

export const listContactsSchema = z.object({
  role: contactRoleTypeSchema.optional(),
  /** When set, matches any of these active roles (OR). Takes precedence over `role`. */
  roles: z.array(contactRoleTypeSchema).min(1).max(5).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  search: z.string().max(200).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});

export const updateClientProfileSchema = z.object({
  creditLimit: z.union([moneyAmountString, z.null()]).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  defaultCurrency: z.string().length(3).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateSupplierProfileSchema = z.object({
  paymentTermsDays: z.number().int().min(0).optional(),
  defaultCurrency: z.string().length(3).optional(),
  bankAccount: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateSubcontractorProfileSchema = z.object({
  specialty: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type AssignContactRoleInput = z.infer<typeof assignContactRoleSchema>;
export type ListContactsInput = z.infer<typeof listContactsSchema>;
export type UpdateClientProfileInput = z.infer<typeof updateClientProfileSchema>;
export type UpdateSupplierProfileInput = z.infer<typeof updateSupplierProfileSchema>;
export type UpdateSubcontractorProfileInput = z.infer<typeof updateSubcontractorProfileSchema>;

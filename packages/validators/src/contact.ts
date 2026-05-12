import { z } from "zod";

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

export const createContactSchema = z.object({
  legalName: z.string().min(1, "La razón social es obligatoria").max(255),
  fantasyName: z.string().max(255).optional(),
  taxId: z.string().max(20).optional(),
  taxIdType: taxIdTypeSchema.optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  country: z.string().length(2).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email("Email inválido").max(255).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
  initialRole: contactRoleTypeSchema.optional(),
});

export const updateContactSchema = z.object({
  legalName: z.string().min(1).max(255).optional(),
  fantasyName: z.string().max(255).optional(),
  taxId: z.string().max(20).optional(),
  taxIdType: taxIdTypeSchema.optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  country: z.string().length(2).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

export const assignContactRoleSchema = z.object({
  role: contactRoleTypeSchema,
  notes: z.string().max(500).optional(),
  // Profile-specific fields
  paymentTermsDays: z.number().int().min(0).optional(),
  creditLimit: z.number().min(0).optional(),
  defaultCurrency: z.string().length(3).optional(),
  bankAccount: z.string().max(50).optional(),
  specialty: z.string().max(255).optional(),
});

export const listContactsSchema = z.object({
  role: contactRoleTypeSchema.optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  search: z.string().max(200).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const updateClientProfileSchema = z.object({
  creditLimit: z.number().min(0).nullable().optional(),
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

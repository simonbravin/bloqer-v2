"use server";

import {
  createContact,
  updateContact,
  archiveContact,
  reactivateContact,
  assignContactRole,
  removeContactRole,
  updateClientProfile,
  updateSupplierProfile,
  updateSubcontractorProfile,
  ServiceError,
} from "@bloqer/services";
import {
  createContactSchema,
  updateContactSchema,
  assignContactRoleSchema,
  updateClientProfileSchema,
  updateSupplierProfileSchema,
  updateSubcontractorProfileSchema,
  type CreateContactInput,
  type UpdateContactInput,
  type AssignContactRoleInput,
  type UpdateClientProfileInput,
  type UpdateSupplierProfileInput,
  type UpdateSubcontractorProfileInput,
} from "@bloqer/validators";
import type { ContactRoleType } from "@bloqer/database";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  return {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
}

export async function createContactAction(
  data: CreateContactInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createContactSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const contact = await createContact(parsed.data, ctx);
    return { id: contact.id };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al crear el contacto" };
  }
}

export async function updateContactAction(
  id: string,
  data: UpdateContactInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateContactSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateContact(id, parsed.data, ctx);
    revalidatePath(`/directorio/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al actualizar el contacto" };
  }
}

export async function archiveContactAction(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await archiveContact(id, ctx);
    revalidatePath(`/directorio/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al archivar el contacto" };
  }
}

export async function reactivateContactAction(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await reactivateContact(id, ctx);
    revalidatePath(`/directorio/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al reactivar el contacto" };
  }
}

export async function assignContactRoleAction(
  contactId: string,
  data: AssignContactRoleInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = assignContactRoleSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await assignContactRole(contactId, parsed.data, ctx);
    revalidatePath(`/directorio/${contactId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al asignar rol" };
  }
}

export async function removeContactRoleAction(
  contactId: string,
  role: ContactRoleType,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await removeContactRole(contactId, role, ctx);
    revalidatePath(`/directorio/${contactId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al quitar rol" };
  }
}

export async function updateClientProfileAction(
  contactId: string,
  data: UpdateClientProfileInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateClientProfileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateClientProfile(contactId, parsed.data, ctx);
    revalidatePath(`/directorio/${contactId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al actualizar perfil" };
  }
}

export async function updateSupplierProfileAction(
  contactId: string,
  data: UpdateSupplierProfileInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateSupplierProfileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateSupplierProfile(contactId, parsed.data, ctx);
    revalidatePath(`/directorio/${contactId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al actualizar perfil" };
  }
}

export async function updateSubcontractorProfileAction(
  contactId: string,
  data: UpdateSubcontractorProfileInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateSubcontractorProfileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateSubcontractorProfile(contactId, parsed.data, ctx);
    revalidatePath(`/directorio/${contactId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al actualizar perfil" };
  }
}

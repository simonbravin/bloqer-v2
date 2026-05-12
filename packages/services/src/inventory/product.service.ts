import { Prisma, prisma, Product, ProductStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateProductInput, UpdateProductInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

// ─── View types ───────────────────────────────────────────────────────────────

export type ProductView = Omit<Product, never>;

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getProductById(id: string, ctx: ServiceContext): Promise<ProductView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver productos");
  }
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  if (product.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return product;
}

export async function listProducts(
  filters: { companyId?: string; status?: ProductStatus },
  ctx: ServiceContext,
): Promise<ProductView[]> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver productos");
  }
  return prisma.product.findMany({
    where: {
      tenantId:  ctx.tenantId,
      companyId: filters.companyId ?? undefined,
      status:    filters.status ?? undefined,
    },
    orderBy: [{ name: "asc" }],
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createProduct(
  input: CreateProductInput,
  ctx: ServiceContext,
): Promise<ProductView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear productos");
  }

  const existing = await prisma.product.findFirst({
    where: {
      tenantId:  ctx.tenantId,
      companyId: input.companyId ?? null,
      sku:       input.sku,
    },
  });
  if (existing) {
    throw new ServiceError("CONFLICT", `Ya existe un producto con SKU "${input.sku}"`);
  }

  const product = await prisma.product.create({
    data: {
      tenantId:    ctx.tenantId,
      companyId:   input.companyId ?? null,
      sku:         input.sku,
      name:        input.name,
      description: input.description ?? null,
      unit:        input.unit ?? "",
      category:    input.category ?? null,
      notes:       input.notes ?? null,
      createdBy:   ctx.actorUserId,
      updatedBy:   ctx.actorUserId,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "PRODUCT_CREATED",
    entityType:  "Product",
    entityId:    product.id,
    after:       { sku: product.sku, name: product.name },
  });

  return product;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  ctx: ServiceContext,
): Promise<ProductView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar productos");
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const product = await prisma.product.update({
    where: { id },
    data: {
      name:        input.name        ?? undefined,
      description: input.description ?? undefined,
      unit:        input.unit        ?? undefined,
      category:    input.category    ?? undefined,
      notes:       input.notes       ?? undefined,
      updatedBy:   ctx.actorUserId,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "PRODUCT_UPDATED",
    entityType:  "Product",
    entityId:    id,
    after:       input,
  });

  return product;
}

export async function deactivateProduct(id: string, ctx: ServiceContext): Promise<ProductView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para desactivar productos");
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status === ProductStatus.INACTIVE) {
    throw new ServiceError("CONFLICT", "El producto ya está inactivo");
  }

  const product = await prisma.product.update({
    where: { id },
    data: { status: ProductStatus.INACTIVE, updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "PRODUCT_DEACTIVATED",
    entityType:  "Product",
    entityId:    id,
  });

  return product;
}

export async function reactivateProduct(id: string, ctx: ServiceContext): Promise<ProductView> {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "INVENTORY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para reactivar productos");
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status === ProductStatus.ACTIVE) {
    throw new ServiceError("CONFLICT", "El producto ya está activo");
  }

  const product = await prisma.product.update({
    where: { id },
    data: { status: ProductStatus.ACTIVE, updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "PRODUCT_REACTIVATED",
    entityType:  "Product",
    entityId:    id,
  });

  return product;
}

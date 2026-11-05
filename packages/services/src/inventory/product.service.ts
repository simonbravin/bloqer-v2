import { prisma, type Product, type ProductStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { isCrossCompany } from "../company-scope";
import { assertInventoryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceError, type ServiceContext } from "../types";
import { assertInventoryProductScope, inventoryProductWhere } from "./inventory-scope";
import {
  canEditProductUnit,
  normalizeProductUnit,
  productUnitReferencesInclude,
} from "./product-unit";

export type ProductView = Product & { canEditUnit?: boolean };
async function authorize(ctx: ServiceContext, action: "VIEW" | "EDIT") {
  await assertInventoryTenantModule(ctx);
  if (!can(ctx.roles, action, "INVENTORY"))
    throw new ServiceError("FORBIDDEN", "Sin permisos para operar productos");
}
export async function getProductById(
  id: string,
  ctx: ServiceContext,
): Promise<ProductView & { canEditUnit: boolean }> {
  await authorize(ctx, "VIEW");
  const row = await prisma.product.findUnique({
    where: { id },
    include: productUnitReferencesInclude,
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  await assertInventoryProductScope(row, ctx);
  const { _count, ...product } = row;
  return { ...product, canEditUnit: canEditProductUnit(_count) };
}
export async function listProducts(
  filters: { companyId?: string; status?: ProductStatus; page?: number; pageSize?: number },
  ctx: ServiceContext,
): Promise<{ data: ProductView[]; total: number }> {
  await authorize(ctx, "VIEW");
  const where = { ...inventoryProductWhere(ctx, filters.companyId), status: filters.status };
  const paginate = filters.page !== undefined || filters.pageSize !== undefined;
  const page = filters.page ?? 1,
    pageSize = filters.pageSize ?? 20;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new ServiceError("VALIDATION", "Paginación inválida");
  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
    prisma.product.count({ where }),
  ]);
  await Promise.all(data.map((row) => assertInventoryProductScope(row, ctx)));
  return { data, total };
}
export async function createProduct(
  input: CreateProductInput,
  ctx: ServiceContext,
): Promise<ProductView> {
  await authorize(ctx, "EDIT");
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Producto inválido");
  input = parsed.data;
  if (isCrossCompany(input.companyId ?? null, ctx))
    throw new ServiceError("FORBIDDEN", "Empresa fuera del contexto autorizado");
  return prisma.$transaction(
    async (tx) => {
      // NULL-company SKU uniqueness also needs a stable parent lock (PostgreSQL NULL semantics).
      if (input.companyId) {
        const company = await tx.company.findFirst({
          where: { id: input.companyId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${input.companyId} FOR NO KEY UPDATE`;
      } else
        await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId} FOR NO KEY UPDATE`;
      if (
        await tx.product.findFirst({
          where: { tenantId: ctx.tenantId, companyId: input.companyId ?? null, sku: input.sku },
        })
      )
        throw new ServiceError("CONFLICT", "Ya existe un producto con ese SKU");
      const row = await tx.product.create({
        data: {
          ...input,
          companyId: input.companyId ?? null,
          tenantId: ctx.tenantId,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: row.companyId,
          actorUserId: ctx.actorUserId,
          action: "PRODUCT_CREATED",
          entityType: "Product",
          entityId: row.id,
          after: { sku: row.sku, name: row.name },
        },
        tx,
      );
      return { ...row, canEditUnit: true };
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
async function mutateProduct(
  id: string,
  ctx: ServiceContext,
  action: string,
  change: (row: Product) => {
    name?: string;
    description?: string | null;
    unit?: string;
    category?: string | null;
    notes?: string | null;
    status?: ProductStatus;
  },
): Promise<ProductView> {
  await authorize(ctx, "EDIT");
  const preview = await prisma.product.findUnique({ where: { id } });
  if (!preview) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
  await assertInventoryProductScope(preview, ctx);
  return prisma.$transaction(
    async (tx) => {
      if (preview.companyId)
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${preview.companyId} FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const current = await tx.product.findUnique({
        where: { id },
        include: productUnitReferencesInclude,
      });
      if (!current || current.tenantId !== ctx.tenantId || current.companyId !== preview.companyId)
        throw new ServiceError("CONFLICT", "El producto cambió. Recargá e intentá de nuevo.");
      const data = change(current);
      const canEditUnit = canEditProductUnit(current._count);
      if (data.unit !== undefined) {
        if (normalizeProductUnit(data.unit) === normalizeProductUnit(current.unit)) {
          // Equivalent spelling is a replay of the existing physical unit, not a rename of history.
          data.unit = current.unit;
        } else if (!canEditUnit) {
          throw new ServiceError(
            "CONFLICT",
            "No se puede cambiar la unidad de un producto referenciado. Para operar otra unidad, creá otro producto.",
          );
        }
      }
      const row = await tx.product.update({
        where: { id },
        data: { ...data, updatedBy: ctx.actorUserId },
      });
      await log(
        {
          tenantId: ctx.tenantId,
          companyId: row.companyId,
          actorUserId: ctx.actorUserId,
          action,
          entityType: "Product",
          entityId: id,
          before: { name: current.name, status: current.status, unit: current.unit },
          after: data,
        },
        tx,
      );
      return { ...row, canEditUnit };
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  ctx: ServiceContext,
): Promise<ProductView> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Producto inválido");
  return mutateProduct(id, ctx, "PRODUCT_UPDATED", () => parsed.data);
}
export async function deactivateProduct(id: string, ctx: ServiceContext): Promise<ProductView> {
  return mutateProduct(id, ctx, "PRODUCT_DEACTIVATED", (row) => {
    if (row.status === "INACTIVE")
      throw new ServiceError("CONFLICT", "El producto ya está inactivo");
    return { status: "INACTIVE" };
  });
}
export async function reactivateProduct(id: string, ctx: ServiceContext): Promise<ProductView> {
  return mutateProduct(id, ctx, "PRODUCT_REACTIVATED", (row) => {
    if (row.status === "ACTIVE") throw new ServiceError("CONFLICT", "El producto ya está activo");
    return { status: "ACTIVE" };
  });
}

import { z } from "zod";
import { idempotencyKeySchema } from "./idempotency";
import { positiveQtyString, unitPriceString } from "./money";

const inventoryQuantity = positiveQtyString.refine(
  (value) => value.split(".")[0]!.replace(/^0+/, "").length <= 14,
  "Cantidad fuera de rango",
);

export const createProductSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  sku: z.string().trim().min(1, "SKU requerido"),
  name: z.string().trim().min(1, "Nombre requerido"),
  description: z.string().optional().nullable(),
  unit: z.string().default(""),
  category: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional().nullable(),
  unit: z.string().optional(),
  category: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createWarehouseSchema = z.object({
  companyId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, "Nombre requerido"),
  type: z.enum(["CENTRAL", "PROJECT", "TEMPORARY", "OTHER"]).default("CENTRAL"),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateWarehouseSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(["CENTRAL", "PROJECT", "TEMPORARY", "OTHER"]).optional(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createStockConsumptionSchema = z.object({
  projectId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  wbsNodeId: z.string().uuid().optional().nullable(),
  quantity: inventoryQuantity,
  movementDate: z.string().date("Fecha inválida"),
  notes: z.string().optional().nullable(),
  idempotencyKey: idempotencyKeySchema,
});

export const createWarehouseTransferSchema = z.object({
  sourceWarehouseId: z.string().uuid("Depósito origen requerido"),
  destinationWarehouseId: z.string().uuid("Depósito destino requerido"),
  productId: z.string().uuid("Producto requerido"),
  projectId: z.string().uuid().optional().nullable(),
  transferDate: z.string().date("Fecha inválida"),
  quantity: inventoryQuantity,
  unitCost: unitPriceString.optional().nullable(),
  notes: z.string().optional().nullable(),
  idempotencyKey: idempotencyKeySchema,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateStockConsumptionInput = z.infer<typeof createStockConsumptionSchema>;
export type CreateWarehouseTransferInput = z.infer<typeof createWarehouseTransferSchema>;

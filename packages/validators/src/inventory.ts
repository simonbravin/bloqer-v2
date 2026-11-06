import { z } from "zod";
import { idempotencyKeySchema } from "./idempotency";
import { positiveQtyString, unitPriceString } from "./money";

const inventoryQuantity = positiveQtyString.refine(
  (value) => value.split(".")[0]!.replace(/^0+/, "").length <= 14,
  "Cantidad fuera de rango",
);

export const createProductSchema = z.object({
  companyId: z.string().guid().optional().nullable(),
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
  companyId: z.string().guid(),
  projectId: z.string().guid().optional().nullable(),
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
  projectId: z.string().guid(),
  warehouseId: z.string().guid(),
  productId: z.string().guid(),
  wbsNodeId: z.string().guid().optional().nullable(),
  quantity: inventoryQuantity,
  movementDate: z.string().date("Fecha inválida"),
  notes: z.string().optional().nullable(),
  idempotencyKey: idempotencyKeySchema,
});

export const createWarehouseTransferSchema = z.object({
  sourceWarehouseId: z.string().guid("Depósito origen requerido"),
  destinationWarehouseId: z.string().guid("Depósito destino requerido"),
  productId: z.string().guid("Producto requerido"),
  projectId: z.string().guid().optional().nullable(),
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

import { z } from "zod";

export const createProductSchema = z.object({
  companyId:   z.string().uuid().optional().nullable(),
  sku:         z.string().min(1, "SKU requerido"),
  name:        z.string().min(1, "Nombre requerido"),
  description: z.string().optional().nullable(),
  unit:        z.string().default(""),
  category:    z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
});

export const updateProductSchema = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  unit:        z.string().optional(),
  category:    z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
});

export const createWarehouseSchema = z.object({
  companyId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  name:      z.string().min(1, "Nombre requerido"),
  type:      z.enum(["CENTRAL", "PROJECT", "TEMPORARY", "OTHER"]).default("CENTRAL"),
  address:   z.string().optional().nullable(),
  notes:     z.string().optional().nullable(),
});

export const updateWarehouseSchema = z.object({
  name:    z.string().min(1).optional(),
  type:    z.enum(["CENTRAL", "PROJECT", "TEMPORARY", "OTHER"]).optional(),
  address: z.string().optional().nullable(),
  notes:   z.string().optional().nullable(),
});

export const createStockConsumptionSchema = z.object({
  projectId:    z.string().uuid(),
  warehouseId:  z.string().uuid(),
  productId:    z.string().uuid(),
  wbsNodeId:    z.string().uuid().optional().nullable(),
  quantity:     z.string().regex(/^\d+(\.\d+)?$/, "Cantidad inválida"),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:        z.string().optional().nullable(),
});

export const createWarehouseTransferSchema = z.object({
  sourceWarehouseId:      z.string().uuid("Depósito origen requerido"),
  destinationWarehouseId: z.string().uuid("Depósito destino requerido"),
  productId:              z.string().uuid("Producto requerido"),
  projectId:              z.string().uuid().optional().nullable(),
  transferDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  quantity:               z.string().regex(/^\d+(\.\d+)?$/, "Cantidad inválida"),
  unitCost:               z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
  notes:                  z.string().optional().nullable(),
});

export type CreateProductInput             = z.infer<typeof createProductSchema>;
export type UpdateProductInput             = z.infer<typeof updateProductSchema>;
export type CreateWarehouseInput           = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput           = z.infer<typeof updateWarehouseSchema>;
export type CreateStockConsumptionInput    = z.infer<typeof createStockConsumptionSchema>;
export type CreateWarehouseTransferInput   = z.infer<typeof createWarehouseTransferSchema>;

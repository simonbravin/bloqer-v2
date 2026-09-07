-- Document library categories: Presupuesto / Cotizacion
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'BUDGET';
ALTER TYPE "DocumentCategory" ADD VALUE IF NOT EXISTS 'QUOTE';

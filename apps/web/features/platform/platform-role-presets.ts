import type { UserRole } from "@bloqer/domain";

export type PlatformRolePreset = {
  id: string;
  labelEs: string;
  descriptionEs: string;
  roles: readonly UserRole[];
};

/** Quick role bundles for platform invitations (maps to `UserRole` enum / Prisma). */
export const PLATFORM_ROLE_PRESETS: readonly PlatformRolePreset[] = [
  {
    id: "owner",
    labelEs: "Propietario",
    descriptionEs: "Acceso total; gobierno del tenant.",
    roles: ["OWNER"],
  },
  {
    id: "admin",
    labelEs: "Administrador",
    descriptionEs: "Operación y configuración; sin transferencia de tenant.",
    roles: ["ADMIN"],
  },
  {
    id: "capataz",
    labelEs: "Capataz de obra",
    descriptionEs: "Obra en campo: partes, RFIs, inventario (lectura).",
    roles: ["SITE_FOREMAN"],
  },
  {
    id: "visor",
    labelEs: "Visor de proyecto",
    descriptionEs: "Solo lectura en módulos de obra.",
    roles: ["PROJECT_VIEWER"],
  },
  {
    id: "finanzas",
    labelEs: "Finanzas",
    descriptionEs: "Tesorería, CxC/CxP, gastos y contabilidad.",
    roles: ["FINANCE"],
  },
] as const;

export const PLATFORM_ROLE_LABEL_ES: Record<UserRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  FINANCE: "Finanzas",
  PROCUREMENT: "Compras",
  WAREHOUSE: "Depósito",
  SALES: "Ventas",
  VIEWER: "Solo lectura",
  PROJECT_MANAGER: "Jefe de obra",
  SITE_FOREMAN: "Capataz",
  PROJECT_VIEWER: "Visor de proyecto",
};

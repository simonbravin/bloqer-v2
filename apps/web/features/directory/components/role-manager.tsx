"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { RoleBadge } from "./role-badge";
import type { ContactRoleType } from "@bloqer/database";
import {
  assignContactRoleAction,
  removeContactRoleAction,
  updateClientProfileAction,
  updateSupplierProfileAction,
  updateSubcontractorProfileAction,
} from "@/app/(app)/directorio/actions";

const ALL_ROLES: ContactRoleType[] = [
  "CLIENT",
  "SUPPLIER",
  "SUBCONTRACTOR",
  "EMPLOYEE",
  "OTHER",
];

const ROLE_LABELS: Record<ContactRoleType, string> = {
  CLIENT: "Cliente",
  SUPPLIER: "Proveedor",
  SUBCONTRACTOR: "Subcontratista",
  EMPLOYEE: "Empleado",
  OTHER: "Otro",
};

type EditTarget = "CLIENT" | "SUPPLIER" | "SUBCONTRACTOR";

/** Plain props only — never pass Prisma Decimal across the RSC boundary. */
export type RoleManagerRole = {
  id: string;
  role: ContactRoleType;
  status: string;
};

export type RoleManagerClientProfile = {
  paymentTermsDays: number;
  defaultCurrency: string;
  creditLimit: string | null;
  notes: string | null;
};

export type RoleManagerSupplierProfile = {
  paymentTermsDays: number;
  defaultCurrency: string;
  bankAccount: string | null;
  notes: string | null;
};

export type RoleManagerSubcontractorProfile = {
  specialty: string | null;
  notes: string | null;
};

interface RoleManagerProps {
  contactId: string;
  canEdit: boolean;
  roles: RoleManagerRole[];
  clientProfile: RoleManagerClientProfile | null;
  supplierProfile: RoleManagerSupplierProfile | null;
  subcontractorProfile: RoleManagerSubcontractorProfile | null;
}

export function RoleManager({
  contactId,
  canEdit,
  roles,
  clientProfile,
  supplierProfile,
  subcontractorProfile,
}: RoleManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const formId = useId();

  function runMutation(action: () => Promise<void>) {
    if (!canEdit || inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try { await action(); } finally { inFlight.current = false; }
    });
  }

  // Assign role form — no default: a CLIENT default caused suppliers to pick up an extra client role.
  const [selectedRole, setSelectedRole] = useState<ContactRoleType | "">("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [specialty, setSpecialty] = useState("");

  // Profile edit form (shared state, reset on open)
  const [editPaymentTermsDays, setEditPaymentTermsDays] = useState("");
  const [editCreditLimit, setEditCreditLimit] = useState("");
  const [editDefaultCurrency, setEditDefaultCurrency] = useState("");
  const [editBankAccount, setEditBankAccount] = useState("");
  const [editSpecialty, setEditSpecialty] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const activeRoles = roles.filter((r) => r.status === "ACTIVE");
  const inactiveRoles = roles.filter((r) => r.status === "INACTIVE");
  const assignableRoles = ALL_ROLES.filter((role) => !activeRoles.some((r) => r.role === role));

  const resetAssignForm = () => {
    setSelectedRole("");
    setPaymentTermsDays("");
    setCreditLimit("");
    setBankAccount("");
    setSpecialty("");
    setError(null);
  };

  const openEditProfile = (target: EditTarget) => {
    setError(null);
    if (target === "CLIENT") {
      setEditPaymentTermsDays(String(clientProfile?.paymentTermsDays ?? "0"));
      setEditCreditLimit(clientProfile?.creditLimit != null ? String(clientProfile.creditLimit) : "");
      setEditDefaultCurrency(clientProfile?.defaultCurrency ?? "ARS");
      setEditNotes(clientProfile?.notes ?? "");
    } else if (target === "SUPPLIER") {
      setEditPaymentTermsDays(String(supplierProfile?.paymentTermsDays ?? "0"));
      setEditDefaultCurrency(supplierProfile?.defaultCurrency ?? "ARS");
      setEditBankAccount(supplierProfile?.bankAccount ?? "");
      setEditNotes(supplierProfile?.notes ?? "");
    } else {
      setEditSpecialty(subcontractorProfile?.specialty ?? "");
      setEditNotes(subcontractorProfile?.notes ?? "");
    }
    setEditTarget(target);
  };

  const parseDays = (raw: string): { ok: true; value: number | undefined } | { ok: false } => {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true, value: undefined };
    const days = Number(trimmed);
    if (!Number.isFinite(days) || !Number.isInteger(days) || days < 0) return { ok: false };
    return { ok: true, value: days };
  };

  const handleAssign = () => {
    setError(null);
    if (!selectedRole) {
      setError("Elegí un rol");
      return;
    }
    const days = parseDays(paymentTermsDays);
    if (!days.ok) {
      setError("El plazo de pago debe ser un número entero mayor o igual a 0");
      return;
    }
    runMutation(async () => {
      try {
        const result = await assignContactRoleAction(contactId, {
          role: selectedRole,
          paymentTermsDays: days.value,
          creditLimit: creditLimit.trim() ? creditLimit.trim() : undefined,
          bankAccount: bankAccount || undefined,
          specialty: specialty || undefined,
        });
        if ("error" in result) {
          setError(result.error);
        } else {
          setAssignOpen(false);
          resetAssignForm();
          router.refresh();
        }
      } catch {
        setError("Error inesperado al asignar rol");
      }
    });
  };

  const handleRemove = (role: ContactRoleType) => {
    setError(null);
    runMutation(async () => {
      try {
        const result = await removeContactRoleAction(contactId, role);
        if ("error" in result) setError(result.error);
        else router.refresh();
      } catch {
        setError("Error inesperado al quitar rol");
      }
    });
  };

  const handleSaveProfile = () => {
    if (!editTarget) return;
    setError(null);
    const days = parseDays(editPaymentTermsDays);
    if ((editTarget === "CLIENT" || editTarget === "SUPPLIER") && !days.ok) {
      setError("El plazo de pago debe ser un número entero mayor o igual a 0");
      return;
    }
    runMutation(async () => {
      try {
        let result: { ok: true } | { error: string };
        if (editTarget === "CLIENT") {
          result = await updateClientProfileAction(contactId, {
            paymentTermsDays: days.ok ? days.value : undefined,
            creditLimit: editCreditLimit.trim() ? editCreditLimit.trim() : null,
            defaultCurrency: editDefaultCurrency.trim() || undefined,
            notes: editNotes,
          });
        } else if (editTarget === "SUPPLIER") {
          result = await updateSupplierProfileAction(contactId, {
            paymentTermsDays: days.ok ? days.value : undefined,
            defaultCurrency: editDefaultCurrency.trim() || undefined,
            bankAccount: editBankAccount,
            notes: editNotes,
          });
        } else {
          result = await updateSubcontractorProfileAction(contactId, {
            specialty: editSpecialty,
            notes: editNotes,
          });
        }
        if ("error" in result) {
          setError(result.error);
        } else {
          setEditTarget(null);
          router.refresh();
        }
      } catch {
        setError("Error inesperado al actualizar perfil");
      }
    });
  };

  const profileEditTitle: Record<EditTarget, string> = {
    CLIENT: "Perfil de cliente",
    SUPPLIER: "Perfil de proveedor",
    SUBCONTRACTOR: "Perfil de subcontratista",
  };

  return (
    <div className="space-y-4">
      {error && !assignOpen && !editTarget && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Roles activos</p>
        {activeRoles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin roles activos</p>
        ) : (
          <div className="flex flex-col gap-2">
            {activeRoles.map((r) => {
              const role = r.role as ContactRoleType;
              const hasProfileFields =
                role === "CLIENT" || role === "SUPPLIER" || role === "SUBCONTRACTOR";
              return (
                <div key={r.id} className="flex items-center gap-2">
                  <RoleBadge role={role} />
                  {canEdit && hasProfileFields && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground"
                      disabled={isPending}
                      onClick={() => openEditProfile(role as EditTarget)}
                    >
                      Editar perfil
                    </Button>
                  )}
                  {canEdit ? <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleRemove(role)}
                    aria-label={`Quitar rol ${ROLE_LABELS[role]}`}
                  >
                    ×
                  </Button> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {inactiveRoles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Roles inactivos</p>
          <div className="flex flex-wrap gap-2">
            {inactiveRoles.map((r) => (
              <div key={r.id} className="flex items-center gap-1 opacity-50">
                <RoleBadge role={r.role} />
                {canEdit ? <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  disabled={isPending}
                  onClick={() =>
                    runMutation(async () => {
                      try {
                        const result = await assignContactRoleAction(contactId, {
                          role: r.role as ContactRoleType,
                        });
                        if ("error" in result) setError(result.error);
                        else router.refresh();
                      } catch {
                        setError("Error inesperado al reactivar rol");
                      }
                    })
                  }
                >
                  Reactivar
                </Button> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {canEdit ? <Button
        variant="outline"
        size="sm"
        onClick={() => { resetAssignForm(); setAssignOpen(true); }}
        disabled={isPending || assignableRoles.length === 0}
      >
        + Asignar rol
      </Button> : null}

      {/* Assign role dialog */}
      <Dialog open={assignOpen} onOpenChange={(open) => { if (!inFlight.current) setAssignOpen(open); }}>
        <DialogContent className="max-w-sm" closeButtonDisabled={isPending}>
          <DialogHeader>
            <DialogTitle>Asignar rol</DialogTitle>
            <DialogDescription>Elegí el rol y completá sus datos opcionales.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-role`}>Rol</Label>
              <Select value={selectedRole || undefined} onValueChange={(v) => setSelectedRole(v as ContactRoleType)}>
                <SelectTrigger id={`${formId}-role`} disabled={isPending}>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(selectedRole === "CLIENT" || selectedRole === "SUPPLIER") && (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-assign-days`}>Plazo de pago (días)</Label>
                <Input
                  id={`${formId}-assign-days`}
                  disabled={isPending}
                  type="number"
                  min={0}
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}

            {selectedRole === "CLIENT" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-assign-credit`}>Límite de crédito (opcional)</Label>
                <DecimalInput
                  id={`${formId}-assign-credit`}
                  disabled={isPending}
                  value={creditLimit}
                  onValueChange={setCreditLimit}
                  placeholder="Sin límite"
                />
              </div>
            )}

            {selectedRole === "SUPPLIER" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-assign-bank`}>CBU / CVU (opcional)</Label>
                <Input
                  id={`${formId}-assign-bank`}
                  disabled={isPending}
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="0000000000000000000000"
                />
              </div>
            )}

            {selectedRole === "SUBCONTRACTOR" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-assign-specialty`}>Especialidad (opcional)</Label>
                <Input
                  id={`${formId}-assign-specialty`}
                  disabled={isPending}
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="Ej: Electricidad, Albañilería..."
                />
              </div>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleAssign} disabled={isPending || !selectedRole}>
              {isPending ? "Guardando..." : "Asignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit profile dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open && !inFlight.current) setEditTarget(null); }}>
        <DialogContent className="max-w-sm" closeButtonDisabled={isPending}>
          <DialogHeader>
            <DialogTitle>{editTarget ? profileEditTitle[editTarget] : ""}</DialogTitle>
            <DialogDescription>Actualizá los datos del perfil. Podés vaciar los datos opcionales para quitarlos.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {(editTarget === "CLIENT" || editTarget === "SUPPLIER") && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-edit-days`}>Plazo de pago (días)</Label>
                  <Input
                    id={`${formId}-edit-days`}
                    disabled={isPending}
                    type="number"
                    min={0}
                    value={editPaymentTermsDays}
                    onChange={(e) => setEditPaymentTermsDays(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-edit-currency`}>Moneda</Label>
                  <Input
                    id={`${formId}-edit-currency`}
                    disabled={isPending}
                    value={editDefaultCurrency}
                    onChange={(e) => setEditDefaultCurrency(e.target.value.toUpperCase())}
                    maxLength={3}
                    placeholder="ARS"
                  />
                </div>
              </>
            )}

            {editTarget === "CLIENT" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-edit-credit`}>Límite de crédito (vacío = sin límite)</Label>
                <DecimalInput
                  id={`${formId}-edit-credit`}
                  disabled={isPending}
                  value={editCreditLimit}
                  onValueChange={setEditCreditLimit}
                  placeholder="Sin límite"
                />
              </div>
            )}

            {editTarget === "SUPPLIER" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-edit-bank`}>CBU / CVU</Label>
                <Input
                  id={`${formId}-edit-bank`}
                  disabled={isPending}
                  value={editBankAccount}
                  onChange={(e) => setEditBankAccount(e.target.value)}
                  placeholder="0000000000000000000000"
                />
              </div>
            )}

            {editTarget === "SUBCONTRACTOR" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-edit-specialty`}>Especialidad</Label>
                <Input
                  id={`${formId}-edit-specialty`}
                  disabled={isPending}
                  value={editSpecialty}
                  onChange={(e) => setEditSpecialty(e.target.value)}
                  placeholder="Ej: Electricidad, Albañilería..."
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-edit-notes`}>Notas</Label>
              <Input
                id={`${formId}-edit-notes`}
                disabled={isPending}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Observaciones..."
              />
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSaveProfile} disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

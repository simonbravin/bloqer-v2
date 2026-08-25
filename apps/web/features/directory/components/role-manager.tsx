"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  roles: RoleManagerRole[];
  clientProfile: RoleManagerClientProfile | null;
  supplierProfile: RoleManagerSupplierProfile | null;
  subcontractorProfile: RoleManagerSubcontractorProfile | null;
}

export function RoleManager({
  contactId,
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
    if (target === "CLIENT" && clientProfile) {
      setEditPaymentTermsDays(String(clientProfile.paymentTermsDays ?? ""));
      setEditCreditLimit(clientProfile.creditLimit != null ? String(clientProfile.creditLimit) : "");
      setEditDefaultCurrency(clientProfile.defaultCurrency ?? "ARS");
      setEditNotes(clientProfile.notes ?? "");
    } else if (target === "SUPPLIER" && supplierProfile) {
      setEditPaymentTermsDays(String(supplierProfile.paymentTermsDays ?? ""));
      setEditDefaultCurrency(supplierProfile.defaultCurrency ?? "ARS");
      setEditBankAccount(supplierProfile.bankAccount ?? "");
      setEditNotes(supplierProfile.notes ?? "");
    } else if (target === "SUBCONTRACTOR" && subcontractorProfile) {
      setEditSpecialty(subcontractorProfile.specialty ?? "");
      setEditNotes(subcontractorProfile.notes ?? "");
    }
    setEditTarget(target);
  };

  const handleAssign = () => {
    setError(null);
    if (!selectedRole) {
      setError("Elegí un rol");
      return;
    }
    startTransition(async () => {
      const paymentDays = paymentTermsDays.trim() ? Number(paymentTermsDays) : undefined;
      const result = await assignContactRoleAction(contactId, {
        role: selectedRole,
        paymentTermsDays: paymentDays != null && Number.isFinite(paymentDays) ? paymentDays : undefined,
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
    });
  };

  const handleRemove = (role: ContactRoleType) => {
    setError(null);
    startTransition(async () => {
      const result = await removeContactRoleAction(contactId, role);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  };

  const handleSaveProfile = () => {
    if (!editTarget) return;
    setError(null);
    startTransition(async () => {
      let result: { ok: true } | { error: string };
      if (editTarget === "CLIENT") {
        const days = editPaymentTermsDays.trim() ? Number(editPaymentTermsDays) : undefined;
        result = await updateClientProfileAction(contactId, {
          paymentTermsDays: days != null && Number.isFinite(days) ? days : undefined,
          creditLimit: editCreditLimit.trim() ? editCreditLimit.trim() : null,
          defaultCurrency: editDefaultCurrency.trim() || undefined,
          notes: editNotes || undefined,
        });
      } else if (editTarget === "SUPPLIER") {
        const days = editPaymentTermsDays.trim() ? Number(editPaymentTermsDays) : undefined;
        result = await updateSupplierProfileAction(contactId, {
          paymentTermsDays: days != null && Number.isFinite(days) ? days : undefined,
          defaultCurrency: editDefaultCurrency.trim() || undefined,
          bankAccount: editBankAccount || undefined,
          notes: editNotes || undefined,
        });
      } else {
        result = await updateSubcontractorProfileAction(contactId, {
          specialty: editSpecialty || undefined,
          notes: editNotes || undefined,
        });
      }
      if ("error" in result) {
        setError(result.error);
      } else {
        setEditTarget(null);
        router.refresh();
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
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
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
              const profileReady =
                (role === "CLIENT" && clientProfile) ||
                (role === "SUPPLIER" && supplierProfile) ||
                (role === "SUBCONTRACTOR" && subcontractorProfile);
              return (
                <div key={r.id} className="flex items-center gap-2">
                  <RoleBadge role={role} />
                  {profileReady && (
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleRemove(role)}
                  >
                    ×
                  </Button>
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await assignContactRoleAction(contactId, {
                        role: r.role as ContactRoleType,
                      });
                      if ("error" in result) setError(result.error);
                      else router.refresh();
                    })
                  }
                >
                  Reactivar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => { resetAssignForm(); setAssignOpen(true); }}
        disabled={isPending || assignableRoles.length === 0}
      >
        + Asignar rol
      </Button>

      {/* Assign role dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Asignar rol</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={selectedRole || undefined} onValueChange={(v) => setSelectedRole(v as ContactRoleType)}>
                <SelectTrigger>
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
                <Label>Plazo de pago (días)</Label>
                <Input
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
                <Label>Límite de crédito (opcional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="Sin límite"
                />
              </div>
            )}

            {selectedRole === "SUPPLIER" && (
              <div className="space-y-1.5">
                <Label>CBU / CVU (opcional)</Label>
                <Input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="0000000000000000000000"
                />
              </div>
            )}

            {selectedRole === "SUBCONTRACTOR" && (
              <div className="space-y-1.5">
                <Label>Especialidad (opcional)</Label>
                <Input
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="Ej: Electricidad, Albañilería..."
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
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
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? profileEditTitle[editTarget] : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {(editTarget === "CLIENT" || editTarget === "SUPPLIER") && (
              <>
                <div className="space-y-1.5">
                  <Label>Plazo de pago (días)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editPaymentTermsDays}
                    onChange={(e) => setEditPaymentTermsDays(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Moneda</Label>
                  <Input
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
                <Label>Límite de crédito (vacío = sin límite)</Label>
                <Input
                  type="number"
                  min={0}
                  value={editCreditLimit}
                  onChange={(e) => setEditCreditLimit(e.target.value)}
                  placeholder="Sin límite"
                />
              </div>
            )}

            {editTarget === "SUPPLIER" && (
              <div className="space-y-1.5">
                <Label>CBU / CVU</Label>
                <Input
                  value={editBankAccount}
                  onChange={(e) => setEditBankAccount(e.target.value)}
                  placeholder="0000000000000000000000"
                />
              </div>
            )}

            {editTarget === "SUBCONTRACTOR" && (
              <div className="space-y-1.5">
                <Label>Especialidad</Label>
                <Input
                  value={editSpecialty}
                  onChange={(e) => setEditSpecialty(e.target.value)}
                  placeholder="Ej: Electricidad, Albañilería..."
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Observaciones..."
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
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

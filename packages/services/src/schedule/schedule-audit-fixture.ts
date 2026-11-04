/** Maintained teardown shared by the AG-05 SQL suite and recovery of its own failed runs. */
import assert from "node:assert/strict";

import { prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";

export async function cleanupScheduleAuditFixture(
  tenantId: string,
  actorId: string,
): Promise<void> {
  await assertAuditDatabaseIdentity(prisma);
  const [tenant, actor] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    prisma.user.findUnique({ where: { id: actorId }, select: { email: true } }),
  ]);
  assert.equal(
    tenant?.slug,
    `audit-ag05-schedule-${tenantId}`,
    "Only this suite's synthetic tenant can be removed",
  );
  assert.equal(
    actor?.email,
    `audit-ag05-schedule-${actorId}@example.test`,
    "Only this suite's synthetic actor can be removed",
  );
  await prisma.$transaction(
    async (tx) => {
      await tx.jobsiteLogProgress.deleteMany({ where: { jobsiteLog: { tenantId } } });
      await tx.jobsiteLog.deleteMany({ where: { tenantId } });
      await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceipt: { tenantId } } });
      await tx.purchaseReceipt.deleteMany({ where: { tenantId } });
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
      await tx.purchaseOrder.deleteMany({ where: { tenantId } });
      await tx.scheduleItemDependency.deleteMany({ where: { tenantId } });
      await tx.scheduleItemWbsLink.deleteMany({ where: { tenantId } });
      await tx.scheduleItem.deleteMany({ where: { tenantId } });
      await tx.schedule.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
      await tx.companyProcurementSettings.deleteMany({ where: { company: { tenantId } } });
      await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
      await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
      await tx.budget.deleteMany({ where: { tenantId } });
      await tx.project.deleteMany({ where: { tenantId } });
      await tx.contact.deleteMany({ where: { tenantId } });
      await tx.company.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
      await tx.user.delete({ where: { id: actorId } });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

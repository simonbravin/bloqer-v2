import { Prisma } from "@prisma/client";
import { prisma } from "../client";

export type QuoteInvitationDb = Prisma.TransactionClient;
export const quoteInvitationRepository = {
  transaction: <T>(work: (tx: QuoteInvitationDb) => Promise<T>) => prisma.$transaction(work, { maxWait: 10_000, timeout: 30_000 }),
  request: (id: string, tenantId: string, db: QuoteInvitationDb = prisma) => db.purchaseRequest.findFirst({
    where: { id, tenantId }, include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, company: true, project: true, tenant: true },
  }),
  supplier: (id: string, tenantId: string, db: QuoteInvitationDb = prisma) => db.contact.findFirst({
    where: { id, tenantId, status: "ACTIVE", roles: { some: { tenantId, role: "SUPPLIER", status: "ACTIVE" } } }, select: { id: true, legalName: true, fantasyName: true },
  }),
  byId: (id: string, tenantId: string, db: QuoteInvitationDb = prisma) => db.procurementQuoteInvitation.findFirst({ where: { id, tenantId } }),
  byToken: (id: string, tokenHash: string, db: QuoteInvitationDb = prisma) => db.procurementQuoteInvitation.findFirst({ where: { id, tokenHash } }),
  list: (purchaseRequestId: string, tenantId: string, companyId: string, projectId: string) => prisma.procurementQuoteInvitation.findMany({ where: { purchaseRequestId, tenantId, companyId, projectId }, orderBy: { createdAt: "desc" }, take: 100 }),
  pending: (purchaseRequestId: string, supplierContactId: string, tenantId: string, db: QuoteInvitationDb) => db.procurementQuoteInvitation.findMany({ where: { purchaseRequestId, supplierContactId, tenantId, revokedAt: null, respondedAt: null } }),
  create: (data: Prisma.ProcurementQuoteInvitationUncheckedCreateInput, db: QuoteInvitationDb) => db.procurementQuoteInvitation.create({ data }),
  update: (id: string, tenantId: string, data: Prisma.ProcurementQuoteInvitationUncheckedUpdateManyInput, db: QuoteInvitationDb) => db.procurementQuoteInvitation.updateMany({ where: { id, tenantId }, data }),
  revokePending: (purchaseRequestId: string, supplierContactId: string, tenantId: string, actor: string, db: QuoteInvitationDb) => db.procurementQuoteInvitation.updateMany({
    where: { purchaseRequestId, supplierContactId, tenantId, revokedAt: null, respondedAt: null }, data: { revokedAt: new Date(), revokedBy: actor, updatedBy: actor },
  }),
  async lockScope(projectId: string, purchaseRequestId: string, tenantId: string, db: QuoteInvitationDb) {
    await db.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} AND "tenantId" = ${tenantId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${purchaseRequestId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  },
  async lock(id: string, tenantId: string, db: QuoteInvitationDb) {
    await db.$queryRaw`SELECT id FROM procurement_quote_invitations WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  },
  async authority(userId: string, tenantId: string, projectId: string, db: QuoteInvitationDb) {
    const [membership, projectMember, modules] = await Promise.all([
      db.userMembership.findFirst({ where: { userId, tenantId, status: "ACTIVE", user: { status: "ACTIVE" } } }),
      db.projectMembership.findFirst({ where: { userId, tenantId, projectId }, select: { id: true } }),
      db.tenantModuleSetting.findMany({ where: { tenantId }, select: { moduleKey: true, isEnabled: true } }),
    ]);
    return { membership, projectMember, modules };
  },
};

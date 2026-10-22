import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { hash } from "bcryptjs";
import { prisma } from "@bloqer/database";
import {
  createInvoiceFromCertification,
  createSalesInvoice,
  getActiveInvoiceForCertification,
  issueSalesInvoice,
  updateSalesInvoice,
} from "../ar/sales-invoice.service";
import { registerArSale } from "../ar/register-ar-sale.service";
import { createCollection, listCollectionsByReceivable } from "../treasury/collection.service";
import { clearProjectAccessModeCache } from "../security/access";
import { listCertificationWbsHints } from "./certification-line.service";
import { assertProcurementFixtureDatabase } from "../procurement/fixtures/procurement-regression";
import { ServiceError, type ServiceContext } from "../types";
import {
  createCertification,
  issueCertification,
  approveCertification,
  cancelCertification,
  getCertificationById,
} from "./certification.service";
import {
  getCertificationMeasurementSheet,
  saveCertificationMeasurement,
  listCertificationCollectionAccounts,
} from "./certification-measurement";

/** Reusable regression suite; requires an explicitly selected, disposable database. */
describe(
  "certification → invoice → receivable → collection (isolated DB)",
  {
    skip: process.env.BLOQER_CERTIFICATION_LIVE_DB !== "1",
    concurrency: false,
  },
  () => {
    let ctx: ServiceContext;
    let projectId: string;
    let budgetId: string;
    let groupId: string;
    let itemId: string;
    let secondItemId: string;
    let accountId: string;
    let draftId: string;
    let fixtureEmail: string;
    const start = "2026-09-01";
    const end = "2026-09-10";
    const scope = () => ({ tenantId: ctx.tenantId, companyId: ctx.companyId!, projectId });
    const draft = () =>
      createCertification({ projectId, budgetId, periodStart: start, periodEnd: end }, ctx);
    const measure = (
      certificationId: string,
      currentQty: string,
      physicalPct: string,
      wbsNodeId = itemId,
    ) =>
      saveCertificationMeasurement(
        { certificationId, rows: [{ wbsNodeId, currentQty, physicalPct, included: true }] },
        ctx,
      );

    before(async () => {
      const database = assertProcurementFixtureDatabase();
      const identity = await prisma.$queryRaw<
        Array<{ database: string }>
      >`SELECT current_database() AS database`;
      assert.equal(identity[0]?.database, database);
      const suffix = randomUUID();
      const tenant = await prisma.tenant.create({
        data: {
          name: "Certificaciones · pruebas",
          slug: `certification-${suffix}`,
          status: "ACTIVE",
        },
      });
      const company = await prisma.company.create({
        data: { tenantId: tenant.id, name: "Constructora de prueba", status: "ACTIVE" },
      });
      const user = await prisma.user.create({
        data: {
          email: `certification-${suffix}@bloqer.demo`,
          name: "Responsable de prueba",
          status: "ACTIVE",
          emailVerified: new Date(),
          passwordHash: await hash("certification-e2e-local-only", 10),
        },
      });
      fixtureEmail = user.email;
      await prisma.userMembership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          companyId: company.id,
          roles: ["OWNER"],
          status: "ACTIVE",
        },
      });
      ctx = { tenantId: tenant.id, companyId: company.id, actorUserId: user.id, roles: ["OWNER"] };
      const client = await prisma.contact.create({
        data: {
          tenantId: tenant.id,
          legalName: "Cliente de prueba",
          roles: { create: { tenantId: tenant.id, role: "CLIENT" } },
        },
      });
      const project = await prisma.project.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          clientContactId: client.id,
          code: "CERT-QA",
          name: "Casa · prueba certificaciones",
          type: "PUBLIC",
          status: "ACTIVE",
        },
      });
      projectId = project.id;
      const budget = await prisma.budget.create({
        data: {
          ...scope(),
          name: "Contrato de prueba",
          status: "APPROVED",
          currency: "ARS",
          versionNumber: 1,
        },
      });
      budgetId = budget.id;
      const group = await prisma.wbsNode.create({
        data: {
          budgetId,
          type: "GROUP",
          code: "1",
          name: "Trabajos preliminares, obrador, replanteo y limpieza",
        },
      });
      groupId = group.id;
      const item = await prisma.wbsNode.create({
        data: {
          budgetId,
          parentId: groupId,
          type: "ITEM",
          code: "1.1",
          name: "Replanteo de obra",
          costItem: {
            create: {
              budgetId,
              unit: "gl",
              quantity: "1",
              unitSalePrice: "1000",
              totalSalePrice: "1000",
              totalCostDirect: "500",
              unitCostDirect: "500",
            },
          },
        },
      });
      itemId = item.id;
      const second = await prisma.wbsNode.create({
        data: {
          budgetId,
          parentId: groupId,
          type: "ITEM",
          code: "1.2",
          name: "Oficina técnica y preparación del terreno",
          costItem: {
            create: {
              budgetId,
              unit: "m2",
              quantity: "100",
              unitSalePrice: "25",
              totalSalePrice: "2500",
              totalCostDirect: "1000",
              unitCostDirect: "10",
            },
          },
        },
      });
      secondItemId = second.id;
      const previewItem = await prisma.wbsNode.create({
        data: {
          budgetId,
          parentId: groupId,
          type: "ITEM",
          code: "1.3",
          name: "Montaje de obrador y servicios provisorios",
          costItem: {
            create: {
              budgetId,
              unit: "gl",
              quantity: "1",
              unitSalePrice: "4000",
              totalSalePrice: "4000",
              totalCostDirect: "2000",
            },
          },
        },
      });
      await prisma.jobsiteLog.create({
        data: {
          ...scope(),
          logDate: new Date(end),
          status: "APPROVED",
          progress: {
            create: { wbsNodeId: previewItem.id, quantityCompleted: "0.45", physicalPct: "45" },
          },
        },
      });
      const supplier = await prisma.contact.create({
        data: {
          tenantId: tenant.id,
          legalName: "Proveedor de prueba",
          roles: { create: { tenantId: tenant.id, role: "SUPPLIER" } },
        },
      });
      const order = await prisma.purchaseOrder.create({
        data: {
          ...scope(),
          supplierContactId: supplier.id,
          number: 1,
          issueDate: new Date(start),
          currency: "ARS",
          status: "PARTIALLY_RECEIVED",
          subtotal: "200",
          totalAmount: "200",
          lines: {
            create: {
              wbsNodeId: itemId,
              description: "Material de replanteo",
              unit: "un",
              quantity: "10",
              unitPrice: "25",
              discountPct: "20",
              lineSubtotal: "200",
              lineTotal: "200",
              receivedQuantity: "7",
            },
          },
        },
        include: { lines: true },
      });
      for (const [receiptDate, quantityReceived, status] of [
        [end, "5", "CONFIRMED"],
        ["2026-09-11", "2", "CONFIRMED"],
        [end, "3", "DRAFT"],
      ] as const) {
        await prisma.purchaseReceipt.create({
          data: {
            ...scope(),
            supplierContactId: supplier.id,
            purchaseOrderId: order.id,
            receiptDate: new Date(receiptDate),
            status,
            lines: { create: { purchaseOrderLineId: order.lines[0]!.id, quantityReceived } },
          },
        });
      }
      for (const [date, physicalPct] of [
        ["2026-09-10", "37"],
        ["2026-09-11", "50"],
      ]) {
        await prisma.jobsiteLog.create({
          data: {
            ...scope(),
            logDate: new Date(date!),
            status: "APPROVED",
            progress: { create: { wbsNodeId: itemId, quantityCompleted: "1", physicalPct } },
          },
        });
      }
      const account = await prisma.treasuryAccount.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          name: "Banco empresa · prueba",
          type: "BANK",
          currency: "ARS",
        },
      });
      accountId = account.id;
      const first = await draft();
      await measure(first.id, "0.12", "12");
      await issueCertification(first.id, ctx);
      await approveCertification(first.id, ctx);
      draftId = (await draft()).id;
      console.info(`UI fixture: ${user.email} /proyectos/${projectId}/certificaciones/${draftId}`);
    });
    after(async () => {
      try {
        if (draftId) {
          const cert = await draft();
          console.info(
            `UI fixture ready: ${fixtureEmail} /proyectos/${projectId}/certificaciones/${cert.id}`,
          );
        }
      } finally {
        await prisma.$disconnect();
      }
    });

    it("shows real parents and suggests 25% after 12% certified and 37% physical at cutoff", async () => {
      const sheet = await getCertificationMeasurementSheet(draftId, ctx);
      assert.equal(sheet.groups[0]?.id, groupId);
      const row = sheet.rows.find((value) => value.wbsNodeId === itemId)!;
      assert.equal(row.parentId, groupId);
      assert.equal(row.previousQty, "0.1200");
      assert.equal(row.suggestedQty, "0.2500");
      assert.equal(row.suggestedPhysicalPct, "25.0000");
      assert.equal(row.suggestions[0]?.amount, "250.00");
      assert.equal(row.logPctAcum, "37.0000");
      assert.equal(row.suggestions[1]?.progressPct, "40.0000");
      assert.equal(row.suggestions[1]?.quantity, "0.2800");
      assert.equal(row.suggestions[2]?.progressPct, "20.0000");
      assert.equal(row.suggestions[2]?.quantity, "0.0800");
      assert.equal(
        await prisma.certificationLine.count({ where: { certificationId: draftId } }),
        0,
      );
    });

    it("saves only the requested line, rejects stale edits and preserves the sale snapshot", async () => {
      const sheet = await getCertificationMeasurementSheet(draftId, ctx);
      await measure(draftId, "0.25", "25");
      await measure(draftId, "10", "10", secondItemId);
      await assert.rejects(
        () =>
          saveCertificationMeasurement(
            {
              certificationId: draftId,
              expectedRevision: sheet.revision,
              rows: [{ wbsNodeId: itemId, currentQty: "0.3", physicalPct: "25", included: true }],
            },
            ctx,
          ),
        /cambió mientras medías/,
      );
      await prisma.costItem.update({
        where: { wbsNodeId: itemId },
        data: { unitSalePrice: "1200" },
      });
      const refreshed = await getCertificationMeasurementSheet(draftId, ctx);
      assert.equal(
        refreshed.rows.find((row) => row.wbsNodeId === itemId)?.unitSalePrice,
        "1000.0000",
      );
      await measure(draftId, "0.25", "25");
      const cert = await getCertificationById(draftId, ctx);
      assert.equal(cert.lines.length, 2);
      assert.equal(cert.totalAmount, "500.00");
      await assert.rejects(
        () =>
          saveCertificationMeasurement(
            {
              certificationId: draftId,
              rows: [
                { wbsNodeId: itemId, included: true, currentQty: "0.25" },
                { wbsNodeId: itemId, included: false },
              ],
            },
            ctx,
          ),
        /partida repetida/,
      );
    });

    it("cannot measure a parent or access another tenant", async () => {
      await assert.rejects(() => measure(draftId, "1", "1", groupId), /partida no pertenece/);
      await assert.rejects(
        () => getCertificationMeasurementSheet(draftId, { ...ctx, tenantId: randomUUID() }),
        (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN",
      );
    });

    it("blocks quantity and physical excess on save, including private projects with notes", async () => {
      await assert.rejects(() => measure(draftId, "0.8801", "25"), /cantidad acumulada supera/);
      await assert.rejects(() => measure(draftId, "0.25", "88.0001"), /físico acumulado supera/);
      await prisma.project.update({ where: { id: projectId }, data: { type: "PRIVATE" } });
      await prisma.certification.update({
        where: { id: draftId },
        data: { notes: "Una nota no autoriza excedentes" },
      });
      try {
        await assert.rejects(() => measure(draftId, "0.8801", "25"), /cantidad acumulada supera/);
      } finally {
        await prisma.project.update({ where: { id: projectId }, data: { type: "PUBLIC" } });
      }
      assert.equal((await getCertificationById(draftId, ctx)).totalAmount, "500.00");
    });

    it("freezes issued measurements and creates exactly one invoice and receivable", async () => {
      await issueCertification(draftId, ctx);
      await assert.rejects(() => measure(draftId, "0.5", "50"), /no puede editarse/);
      await approveCertification(draftId, ctx);
      assert.equal(await prisma.accountMovement.count({ where: { tenantId: ctx.tenantId } }), 0);
      assert.equal(await prisma.receivable.count({ where: { tenantId: ctx.tenantId } }), 0);
      const input = {
        certificationId: draftId,
        issueDate: end,
        dueDate: "2026-10-10",
        taxRate: "0",
        iibbPerceptionRate: "0",
        invoiceLetter: "B" as const,
      };
      const invoice = await createInvoiceFromCertification(input, ctx, projectId);
      assert.equal(invoice.totalAmount, "500.00");
      assert.equal(await prisma.receivable.count({ where: { tenantId: ctx.tenantId } }), 0);
      await assert.rejects(
        () => createInvoiceFromCertification(input, ctx, projectId),
        /factura activa/,
      );
      await assert.rejects(() => cancelCertification(draftId, ctx), /factura activa/);
      await issueSalesInvoice(invoice.id, ctx, projectId);
      await assert.rejects(() => issueSalesInvoice(invoice.id, ctx, projectId));
      const receivables = await prisma.receivable.findMany({
        where: { salesInvoiceId: invoice.id },
      });
      assert.equal(receivables.length, 1);
      const receivable = receivables[0]!;
      assert.equal(receivable.projectId, projectId);
      assert.equal(receivable.companyId, ctx.companyId);
      assert.equal(receivable.originalAmount.toFixed(2), "500.00");
      await assert.rejects(
        () =>
          createCollection(
            {
              receivableId: receivable.id,
              accountId,
              collectionDate: end,
              amount: "500.01",
              reference: null,
              idempotencyKey: randomUUID(),
            },
            ctx,
            projectId,
          ),
        /supera el saldo/,
      );
      const otherCompany = await prisma.company.create({
        data: { tenantId: ctx.tenantId, name: "Otra empresa", status: "ACTIVE" },
      });
      const wrongAccount = await prisma.treasuryAccount.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: otherCompany.id,
          name: "Banco otra empresa",
          type: "BANK",
          currency: "ARS",
        },
      });
      await assert.rejects(
        () =>
          createCollection(
            {
              receivableId: receivable.id,
              accountId: wrongAccount.id,
              collectionDate: end,
              amount: "125",
              reference: null,
              idempotencyKey: randomUUID(),
            },
            ctx,
            projectId,
          ),
        /empresa activa/,
      );
      const partialInput = {
        receivableId: receivable.id,
        accountId,
        collectionDate: end,
        amount: "125.00",
        reference: null,
        idempotencyKey: randomUUID(),
      };
      const partial = await createCollection(partialInput, ctx, projectId);
      assert.equal((await createCollection(partialInput, ctx, projectId)).id, partial.id);
      assert.equal(
        (
          await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })
        ).paidAmount.toFixed(2),
        "125.00",
      );
      await createCollection(
        {
          receivableId: receivable.id,
          accountId,
          collectionDate: end,
          collectFullBalance: true,
          reference: null,
          idempotencyKey: randomUUID(),
        },
        ctx,
        projectId,
      );
      const paid = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
      assert.equal(paid.status, "PAID");
      assert.equal(paid.paidAmount.toFixed(2), "500.00");
      const movements = await prisma.accountMovement.findMany({
        where: { tenantId: ctx.tenantId },
      });
      assert.equal(movements.length, 2);
      assert.ok(
        movements.every(
          (movement) =>
            movement.projectId === projectId &&
            movement.accountId === accountId &&
            movement.companyId === ctx.companyId &&
            movement.type === "INFLOW",
        ),
      );
      assert.equal((await listCertificationCollectionAccounts(draftId, ctx)).length, 2);
      assert.equal((await getCertificationById(draftId, ctx)).status, "APPROVED");
    });

    it("serializes simultaneous issues and never reserves the same remaining quantity twice", async () => {
      const left = await draft();
      const right = await draft();
      await measure(left.id, "0.5", "50");
      await measure(right.id, "0.5", "50");
      const results = await Promise.allSettled([
        issueCertification(left.id, ctx),
        issueCertification(right.id, ctx),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const totals = await prisma.certificationLine.aggregate({
        where: {
          wbsNodeId: itemId,
          certification: { tenantId: ctx.tenantId, status: { in: ["ISSUED", "APPROVED"] } },
        },
        _sum: { currentQty: true },
      });
      assert.equal(totals._sum.currentQty?.toFixed(4), "0.8700");
    });

    it("preserves foreign currency and explicit FX through invoice, collection and project attribution", async () => {
      const project = await prisma.project.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          clientContactId: (await prisma.project.findUniqueOrThrow({ where: { id: projectId } }))
            .clientContactId,
          name: "Obra USD",
          code: "CERT-USD",
          type: "PRIVATE",
          status: "ACTIVE",
        },
      });
      const budget = await prisma.budget.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          projectId: project.id,
          name: "Contrato USD",
          currency: "USD",
          status: "APPROVED",
          versionNumber: 1,
        },
      });
      const item = await prisma.wbsNode.create({
        data: {
          budgetId: budget.id,
          type: "ITEM",
          code: "1",
          name: "Partida USD",
          costItem: {
            create: { budgetId: budget.id, unit: "gl", quantity: "1", unitSalePrice: "100" },
          },
        },
      });
      const cert = await createCertification(
        { projectId: project.id, budgetId: budget.id, periodStart: start, periodEnd: end },
        ctx,
      );
      await measure(cert.id, "0.5", "50", item.id);
      await issueCertification(cert.id, ctx);
      await approveCertification(cert.id, ctx);
      const input = {
        certificationId: cert.id,
        issueDate: end,
        dueDate: end,
        taxRate: "0",
        iibbPerceptionRate: "0",
        invoiceLetter: "B" as const,
      };
      await assert.rejects(
        () => createInvoiceFromCertification(input, ctx, project.id),
        /tipo de cambio/,
      );
      const invoice = await createInvoiceFromCertification(
        { ...input, fxRate: "1200.123456" },
        ctx,
        project.id,
      );
      assert.equal(invoice.currency, "USD");
      await issueSalesInvoice(invoice.id, ctx, project.id);
      assert.equal(
        (
          await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
        ).amountArs.toFixed(2),
        "60006.17",
      );
      const receivable = await prisma.receivable.findUniqueOrThrow({
        where: { salesInvoiceId: invoice.id },
      });
      const account = await prisma.treasuryAccount.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          name: "Banco USD",
          type: "BANK",
          currency: "USD",
        },
      });
      const payment = {
        receivableId: receivable.id,
        accountId: account.id,
        collectionDate: end,
        collectFullBalance: true,
        reference: null,
        idempotencyKey: randomUUID(),
      };
      await assert.rejects(() => createCollection(payment, ctx, project.id), /tipo de cambio/);
      const collection = await createCollection({ ...payment, fxRate: "1250" }, ctx, project.id);
      const stored = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
      assert.equal(stored.amount.toFixed(2), "50.00");
      assert.equal(stored.amountArs.toFixed(2), "62500.00");
      assert.equal(stored.projectId, project.id);
      await assert.rejects(
        () => createCollection({ ...payment, fxRate: "1300" }, ctx, project.id),
        /datos distintos/,
      );
    });

    it("rejects certification links injected through both manual invoice entry points", async () => {
      const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      const cert = await getCertificationById(draftId, ctx);
      const input = {
        projectId,
        clientContactId: project.clientContactId,
        issueDate: end,
        dueDate: end,
        currency: "ARS",
        invoiceLetter: "B" as const,
        iibbPerceptionRate: "0",
        externalInvoiceRef: null,
        lines: [
          {
            description: "Venta manual",
            quantity: "1",
            unitPrice: "100",
            taxRate: "0",
            discountPct: "0",
            sortOrder: 0,
          },
        ],
      };
      const count = await prisma.salesInvoice.count({ where: { tenantId: ctx.tenantId } });
      await assert.rejects(
        () => createSalesInvoice({ ...input, certificationId: draftId }, ctx),
        /flujo de factura desde certificación/,
      );
      const linkedLine = { ...input.lines[0]!, certificationLineId: cert.lines[0]!.id };
      await assert.rejects(
        () => createSalesInvoice({ ...input, lines: [linkedLine] }, ctx),
        /flujo de factura desde certificación/,
      );
      await assert.rejects(
        () => registerArSale({ ...input, lines: [linkedLine], idempotencyKey: randomUUID() }, ctx),
        /flujo de factura desde certificación/,
      );
      assert.equal(await prisma.salesInvoice.count({ where: { tenantId: ctx.tenantId } }), count);
    });

    it("serializes concurrent invoice editing and issue without changing the receivable amount afterward", async () => {
      const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      const invoice = await createSalesInvoice(
        {
          projectId,
          clientContactId: project.clientContactId,
          issueDate: end,
          dueDate: end,
          currency: "ARS",
          invoiceLetter: "B",
          iibbPerceptionRate: "0",
          externalInvoiceRef: null,
          lines: [
            {
              description: "Carrera edición/emisión",
              quantity: "1",
              unitPrice: "100",
              taxRate: "21",
              discountPct: "0",
              sortOrder: 0,
            },
          ],
        },
        ctx,
      );
      const [issue, edit] = await Promise.allSettled([
        issueSalesInvoice(invoice.id, ctx, projectId),
        updateSalesInvoice(invoice.id, { invoiceLetter: "C" }, ctx, projectId),
      ]);
      if (issue.status === "rejected") throw issue.reason;
      if (edit.status === "rejected") {
        assert.ok(edit.reason instanceof ServiceError && edit.reason.code === "CONFLICT");
      }
      const saved = await prisma.salesInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { receivable: true },
      });
      assert.equal(saved.status, "ISSUED");
      const expectedAmount = edit.status === "fulfilled" ? "100.00" : "121.00";
      assert.equal(saved.invoiceLetter, edit.status === "fulfilled" ? "C" : "B");
      assert.equal(saved.totalAmount.toFixed(2), expectedAmount);
      assert.equal(saved.receivable?.originalAmount.toFixed(2), expectedAmount);
      await assert.rejects(
        () => updateSalesInvoice(invoice.id, { iibbPerceptionRate: "3" }, ctx, projectId),
        /no puede editarse/,
      );
    });

    it("enforces project membership in invoice, WBS and collection helper reads", async () => {
      const invoice = await prisma.salesInvoice.findFirstOrThrow({
        where: { certificationId: draftId },
        include: { receivable: true },
      });
      await prisma.tenant.update({
        where: { id: ctx.tenantId },
        data: { projectAccessMode: "MEMBERSHIP_SCOPED" },
      });
      clearProjectAccessModeCache();
      const restricted = { ...ctx, roles: ["PROJECT_FINANCE"] as ServiceContext["roles"] };
      const forbidden = (error: unknown) =>
        error instanceof ServiceError && error.code === "FORBIDDEN";
      try {
        await assert.rejects(
          () => getActiveInvoiceForCertification(draftId, restricted),
          forbidden,
        );
        await assert.rejects(() => listCertificationWbsHints(draftId, restricted), forbidden);
        await assert.rejects(
          () => listCollectionsByReceivable(invoice.receivable!.id, restricted, projectId),
          forbidden,
        );
      } finally {
        await prisma.tenant.update({
          where: { id: ctx.tenantId },
          data: { projectAccessMode: "TENANT_WIDE" },
        });
        clearProjectAccessModeCache();
      }
      assert.equal(
        (await listCollectionsByReceivable(invoice.receivable!.id, ctx, projectId)).length,
        2,
      );
      await assert.rejects(
        () => getActiveInvoiceForCertification(draftId, { ...ctx, companyId: randomUUID() }),
        forbidden,
      );
      await assert.rejects(
        () =>
          listCollectionsByReceivable(invoice.receivable!.id, { ...ctx, companyId: randomUUID() }),
        forbidden,
      );
    });

    it("keeps the measurement sheet available without exposing AR when that module is disabled", async () => {
      const setting = await prisma.tenantModuleSetting.create({
        data: { tenantId: ctx.tenantId, moduleKey: "AR", isEnabled: false },
      });
      try {
        assert.equal(await getActiveInvoiceForCertification(draftId, ctx), null);
        assert.deepEqual(await listCertificationCollectionAccounts(draftId, ctx), []);
        const sheet = await getCertificationMeasurementSheet(draftId, ctx);
        assert.equal(sheet.rows.length, 2);
        assert.equal(sheet.costAvailable, false);
        assert.equal(sheet.rows.find((row) => row.wbsNodeId === itemId)?.physicalPct, "25.0000");
      } finally {
        await prisma.tenantModuleSetting.delete({ where: { id: setting.id } });
      }
    });
  },
);

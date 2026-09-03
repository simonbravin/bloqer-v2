import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentRevalidatePaths } from "./document-revalidate-paths";

describe("documentRevalidatePaths", () => {
  it("always includes the library and the document ficha", () => {
    const paths = documentRevalidatePaths({
      projectId: "p1",
      documentId: "d1",
      linkedEntityType: "PROJECT",
      linkedEntityId: "p1",
    });
    assert.deepEqual(paths, ["/proyectos/p1/documentos", "/proyectos/p1/documentos/d1"]);
  });

  it("adds the operational ficha for a linked attachment", () => {
    const invoice = documentRevalidatePaths({
      projectId: "p1",
      documentId: "d1",
      linkedEntityType: "SUPPLIER_INVOICE",
      linkedEntityId: "inv-9",
    });
    assert.ok(invoice.includes("/proyectos/p1/facturas-proveedor/inv-9"));

    const log = documentRevalidatePaths({
      projectId: "p1",
      documentId: "d1",
      linkedEntityType: "JOBSITE_LOG",
      linkedEntityId: "jl-1",
    });
    assert.ok(log.includes("/proyectos/p1/libro-obra/jl-1"));
  });
});

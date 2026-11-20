import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  computeKnowledgeSourceManifest,
  hashFileContent,
  KNOWLEDGE_DOC_INCLUDE,
} from "../../scripts/knowledge-sources";

test("knowledge source hashes ignore checkout line endings but preserve meaningful edits", () => {
  const content = "# Guía\n\nRevisar el comprobante antes de guardar.\n";
  assert.equal(hashFileContent(content), hashFileContent(content.replace(/\n/g, "\r\n")));
  assert.notEqual(hashFileContent(content), hashFileContent(content.replace("antes", "después")));
  assert.notEqual(hashFileContent(content), hashFileContent(content.replace("\n\n", "\n \n")));
});

test("knowledge manifests and byte counts match Windows and Linux checkouts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bloqer-knowledge-manifest-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const linuxRoot = path.join(root, "linux");
  const windowsRoot = path.join(root, "windows");
  for (const rel of KNOWLEDGE_DOC_INCLUDE) {
    const content = `# Guía de prueba\n\nFuente: ${rel}\n`;
    for (const [docsRoot, text] of [
      [linuxRoot, content],
      [windowsRoot, content.replace(/\n/g, "\r\n")],
    ] as const) {
      const file = path.join(docsRoot, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text, "utf8");
    }
  }

  const linux = computeKnowledgeSourceManifest(linuxRoot);
  assert.deepEqual(computeKnowledgeSourceManifest(windowsRoot), linux);
  fs.appendFileSync(path.join(windowsRoot, KNOWLEDGE_DOC_INCLUDE[0]), "Cambio operativo.\r\n");
  assert.notEqual(computeKnowledgeSourceManifest(windowsRoot).sourceHash, linux.sourceHash);
});

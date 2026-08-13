#!/usr/bin/env node
/**
 * Validates screenshot files against the manifest and writes CAPTURE_REPORT.md.
 * Usage: node docs/bloqer2.0/guides/capture/validate-screenshots.js [--pilot]
 */
const fs = require("fs");
const path = require("path");
const {
  MANIFEST_PATH,
  CAPTURE_REPORT_PATH,
  SCREENSHOTS_DIR,
  VIEWPORT,
} = require("./paths");

function readPngDimensions(buf) {
  if (buf.length < 24 || buf[0] !== 0x89) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readJpegDimensions(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 9) };
    }
    i += 2 + len;
  }
  return null;
}

function imageDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  if (filePath.endsWith(".png")) return readPngDimensions(buf);
  if (/\.jpe?g$/i.test(filePath)) return readJpegDimensions(buf);
  return null;
}

function validateCapture(capture, pilotOnly) {
  if (pilotOnly && !capture.pilot) {
    return {
      id: capture.id,
      title: capture.title,
      route: capture.route || "—",
      status: "PENDIENTE",
      result: "SKIP",
      file: capture.filename,
      notes: "Fuera del alcance del piloto",
    };
  }

  const filePath = path.join(SCREENSHOTS_DIR, capture.filename);
  if (!fs.existsSync(filePath)) {
    return {
      id: capture.id,
      title: capture.title,
      route: capture.route || "—",
      status: capture.pilot ? "REQUIERE DATOS" : "PENDIENTE",
      result: "MISSING",
      file: capture.filename,
      notes: "Archivo no generado",
    };
  }

  const stat = fs.statSync(filePath);
  if (stat.size < 1024) {
    return {
      id: capture.id,
      title: capture.title,
      route: capture.route || "—",
      status: "BLOQUEADA",
      result: "EMPTY",
      file: capture.filename,
      notes: `Archivo demasiado pequeño (${stat.size} bytes)`,
    };
  }

  const dims = imageDimensions(filePath);
  if (!dims) {
    return {
      id: capture.id,
      title: capture.title,
      route: capture.route || "—",
      status: "REQUIERE VALIDACIÓN MANUAL",
      result: "UNKNOWN_DIMS",
      file: capture.filename,
      notes: "No se pudieron leer dimensiones",
    };
  }

  if (dims.width !== VIEWPORT.width) {
    return {
      id: capture.id,
      title: capture.title,
      route: capture.route || "—",
      status: "REQUIERE VALIDACIÓN MANUAL",
      result: "WIDTH",
      file: capture.filename,
      notes: `Ancho ${dims.width}px (esperado ${VIEWPORT.width}px)`,
    };
  }

  return {
    id: capture.id,
    title: capture.title,
    route: capture.route || "—",
    status: "OK",
    result: "OK",
    file: capture.filename,
    notes: `${dims.width}×${dims.height}px`,
  };
}

function writeReport(rows, manifest) {
  const ok = rows.filter((r) => r.status === "OK").length;
  const pending = rows.filter((r) => r.status === "PENDIENTE").length;
  const blocked = rows.filter((r) => r.status === "BLOQUEADA").length;
  const needsData = rows.filter((r) => r.status === "REQUIERE DATOS").length;
  const manual = rows.filter((r) => r.status === "REQUIERE VALIDACIÓN MANUAL").length;

  const lines = [
    "# Reporte de capturas — Guía Operativa Bloqer v2",
    "",
    `Generado: ${new Date().toISOString()}`,
    "",
    `Total en manifest: **${manifest.totalCaptures}** · OK: **${ok}** · Pendiente: **${pending}** · Requiere datos: **${needsData}** · Bloqueada: **${blocked}** · Validación manual: **${manual}**`,
    "",
    "| ID | Captura | Ruta | Estado | Resultado | Archivo | Observaciones |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const r of rows) {
    const esc = (s) => String(s).replace(/\|/g, "\\|");
    lines.push(
      `| ${esc(r.id)} | ${esc(r.title)} | ${esc(r.route)} | ${esc(r.status)} | ${esc(r.result)} | ${esc(r.file)} | ${esc(r.notes)} |`,
    );
  }

  lines.push("");
  fs.writeFileSync(CAPTURE_REPORT_PATH, lines.join("\n") + "\n", "utf8");
}

function main() {
  const pilotOnly = process.argv.includes("--pilot");
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error("Manifest missing. Run parse-captures.js first.");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const rows = manifest.captures.map((c) => validateCapture(c, pilotOnly));
  writeReport(rows, manifest);

  const okIds = rows.filter((r) => r.status === "OK").map((r) => r.id);
  const sidecar = {
    generatedAt: new Date().toISOString(),
    pilotOnly,
    okCaptureIds: okIds,
    rows,
  };
  fs.writeFileSync(
    path.join(path.dirname(MANIFEST_PATH), "capture-validation.json"),
    JSON.stringify(sidecar, null, 2) + "\n",
    "utf8",
  );

  console.log(`Report: ${CAPTURE_REPORT_PATH}`);
  console.log(`OK: ${okIds.length}/${rows.length}`);
  if (pilotOnly) {
    const pilotRows = rows.filter((r) => manifest.pilotCaptureIds.includes(r.id));
    console.log(`Pilot OK: ${pilotRows.filter((r) => r.status === "OK").length}/${pilotRows.length}`);
  }
}

main();

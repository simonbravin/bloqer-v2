#!/usr/bin/env node
/**
 * Regenerates screenshots-manifest.json from GUIA_OPERATIVA_BLOQER_V2.md capture blocks.
 * Usage: node docs/bloqer2.0/guides/capture/parse-captures.js
 */
const fs = require("fs");
const path = require("path");
const {
  GUIDE_MD,
  MANIFEST_PATH,
  SCREENSHOTS_DIR,
  VIEWPORT,
  PILOT_TITLES,
} = require("./paths");

function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 55);
}

function padId(n) {
  return String(n).padStart(2, "0");
}

function parseDetailLine(line) {
  const parts = line.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean);
  const out = { route: null, show: null, tip: null, raw: line };
  for (const part of parts) {
    const routeM = part.match(/^Ruta:\s*(.+)$/i);
    if (routeM) {
      out.route = routeM[1]
        .replace(/^`|`$/g, "")
        .trim()
        .split(/\s+o\s+/i)[0]
        ?.trim() ?? null;
      continue;
    }
    const showM = part.match(/^(Mostrar|Abrir)\s+(.+)$/i);
    if (showM) {
      out.show = `${showM[1]} ${showM[2]}`;
      continue;
    }
    const tipM = part.match(/^Tip:\s*(.+)$/i);
    if (tipM) {
      out.tip = tipM[1];
      continue;
    }
  }
  return out;
}

function inferMetadata(title, detail, section) {
  const blob = `${title} ${detail.raw || ""} ${section}`.toLowerCase();
  const internalOnly =
    /solo para material interno|no entregar al cliente|proveedor saas/.test(blob);

  const requiresAuth =
    !/login|invitaciones\/aceptar/.test((detail.route || "").toLowerCase()) ||
    /cualquier pantalla autenticada/.test(detail.raw || "");

  let role = "OWNER";
  if (/superadmin|plataforma|\/platform\//.test(blob)) role = "PLATFORM_SUPERADMIN";
  else if (/finanzas|finance|tesorer|treasurer/.test(blob)) role = "FINANCE_OR_TREASURER";
  else if (/compras|procurement/.test(blob)) role = "PROCUREMENT";
  else if (/anonymous|\/login/.test((detail.route || "").toLowerCase())) role = "anonymous";

  const interactions = [];
  if (/modal|diálogo|dialogo/.test(blob)) interactions.push("open-modal");
  if (/dropdown|desplegable/.test(blob)) interactions.push("open-dropdown");
  if (/campana/.test(blob)) interactions.push("open-notifications");
  if (/expand/.test(blob)) interactions.push("expand-row");
  if (/tab|pestaña/.test(blob)) interactions.push("select-tab");
  if (/filtro/.test(blob)) interactions.push("apply-filters");
  if (/gantt|cronograma/.test(blob)) interactions.push("schedule-gantt-view");
  if (/sidebar|menú|menu/.test(blob)) interactions.push("show-sidebar");

  const dataRequirements = [];
  const route = detail.route || "";
  if (/\[id\]|\[projectId\]|proyectos\/\[/.test(route)) dataRequirements.push("active-project");
  if (/\[budgetId\]|presupuesto/.test(route)) dataRequirements.push("approved-budget");
  if (/\[poId\]|ordenes-compra/.test(route)) dataRequirements.push("purchase-order");
  if (/status=CONFIRMED|confirmada/.test(blob)) dataRequirements.push("po-confirmed");
  if (/\[accountId\]|cuenta/.test(route)) dataRequirements.push("treasury-account");
  if (/\[certId\]|certificacion/.test(route)) dataRequirements.push("certification");
  if (/conciliacion/.test(route)) dataRequirements.push("reconciliation-session");
  if (/directorio|contacto/.test(route)) dataRequirements.push("directory-contacts");
  if (/cronograma|tareas|hitos/.test(blob)) dataRequirements.push("schedule-tasks");

  let sessionGroup = "owner-main";
  if (role === "anonymous") sessionGroup = "anonymous";
  else if (role === "PLATFORM_SUPERADMIN") sessionGroup = "platform-internal";
  else if (/tesoreria|conciliacion|finanzas|contabilidad/.test(route)) sessionGroup = "finance-treasury";

  return {
    internalOnly,
    requiresAuth: role === "anonymous" ? false : requiresAuth,
    role,
    interactions,
    dataRequirements: [...new Set(dataRequirements)],
    sessionGroup,
    endUserCapture: !internalOnly,
  };
}

function loadPreviousBySlug() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    const prev = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    return Object.fromEntries((prev.captures || []).map((c) => [c.slug, c]));
  } catch {
    return {};
  }
}

function buildCaptureRecord({
  id,
  slug,
  title,
  sectionPath,
  detail,
  prevBySlug,
  applied = false,
}) {
  const prev = prevBySlug[slug] || {};
  const meta = inferMetadata(title, detail, sectionPath);
  const filename = prev.filename || `${id}-${slug}.png`;
  return {
    id,
    slug,
    title,
    section: sectionPath,
    route: detail.route ?? prev.route ?? null,
    routeTemplate: detail.route ?? prev.routeTemplate ?? prev.route ?? null,
    show: detail.show ?? prev.show ?? null,
    tip: detail.tip ?? prev.tip ?? null,
    filename,
    relativePath: `./guides/assets/screenshots/${filename}`,
    ...meta,
    applied,
    pilot: PILOT_TITLES.has(title),
  };
}

function parseGuideCaptures(md) {
  const lines = md.split(/\r?\n/);
  const captures = [];
  const prevBySlug = loadPreviousBySlug();
  let section = "";
  let subsection = "";
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (/^```/.test(t)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (/^##\s+/.test(line)) {
      section = line.replace(/^##\s+/, "").trim();
      subsection = "";
      continue;
    }
    if (/^###\s+/.test(line)) {
      subsection = line.replace(/^###+\s+/, "").trim();
      continue;
    }

    const commentM = t.match(/^<!-- capture:(\d+) ([a-z0-9-]+) -->$/);
    if (commentM) {
      const id = commentM[1];
      const slug = commentM[2];
      let title = prevBySlug[slug]?.title || slug;
      const imgLine = (lines[i + 1] || "").trim();
      const altM = imgLine.match(/^!\[Bloqer — ([^\]]+)\]/);
      if (altM) title = altM[1].trim();
      const pathM = imgLine.match(/\(([^)]+)\)/);
      const sectionPath = subsection ? `${section} › ${subsection}` : section;
      const detail = parseDetailLine(prevBySlug[slug]?.tip ? `Tip: ${prevBySlug[slug].tip}` : "");
      if (prevBySlug[slug]?.route) detail.route = prevBySlug[slug].route;
      captures.push(
        buildCaptureRecord({
          id,
          slug,
          title,
          sectionPath,
          detail,
          prevBySlug,
          applied: true,
        }),
      );
      continue;
    }

    if (!/^>\s*\*{0,2}\s*📷\s*Captura sugerida/i.test(line)) continue;

    const block = [];
    while (i < lines.length && /^>/.test(lines[i])) {
      block.push(lines[i].replace(/^>\s?/, "").replace(/\s+$/, ""));
      i++;
    }
    i--;

    const titleM = (block[0] || "").match(/📷\s*Captura sugerida\s*[—–-]\s*(.+?)\s*\*{0,2}$/i);
    const title = titleM ? titleM[1].trim() : "Sin título";
    const detailLine = block.slice(1).join(" ");
    const detail = parseDetailLine(detailLine);
    const sectionPath = subsection ? `${section} › ${subsection}` : section;
    const slug = slugify(title);
    const id = prevBySlug[slug]?.id || padId(captures.length + 1);

    captures.push(
      buildCaptureRecord({
        id,
        slug,
        title,
        sectionPath,
        detail,
        prevBySlug,
        applied: false,
      }),
    );
  }

  return captures;
}

function main() {
  if (!fs.existsSync(GUIDE_MD)) {
    console.error("Guide MD not found:", GUIDE_MD);
    process.exit(1);
  }

  const md = fs.readFileSync(GUIDE_MD, "utf8");
  const captures = parseGuideCaptures(md);

  const manifest = {
    version: 1,
    source: path.relative(path.dirname(MANIFEST_PATH), GUIDE_MD).replace(/\\/g, "/"),
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    totalCaptures: captures.length,
    pilotCaptureIds: [...new Set(captures.filter((c) => c.pilot).map((c) => c.id))],
    sessionGroups: [...new Set(captures.map((c) => c.sessionGroup))],
    captures,
  };

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Manifest written: ${MANIFEST_PATH}`);
  console.log(`Total captures: ${captures.length}`);
  console.log(`Pilot captures: ${manifest.pilotCaptureIds.join(", ")}`);
  console.log(`Internal-only: ${captures.filter((c) => c.internalOnly).length}`);
}

main();

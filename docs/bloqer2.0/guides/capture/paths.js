/** Shared paths for guide screenshot automation. */
const path = require("path");

const GUIDES_DIR = path.resolve(__dirname, "..");
const DOCS_DIR = path.resolve(GUIDES_DIR, "..");
const GUIDE_MD = path.join(DOCS_DIR, "GUIA_OPERATIVA_BLOQER_V2.md");
const MANIFEST_PATH = path.join(GUIDES_DIR, "screenshots-manifest.json");
const SCREENSHOTS_DIR = path.join(GUIDES_DIR, "assets", "screenshots");
const CAPTURE_REPORT_PATH = path.join(GUIDES_DIR, "CAPTURE_REPORT.md");

const VIEWPORT = { width: 1440, height: 1000 };

const PILOT_TITLES = new Set([
  "Login (email + Google)",
  "Dashboard / menú empresa",
  "Alta de proyecto",
  "Cronograma Gantt",
  "OC confirmada con links",
]);

module.exports = {
  GUIDES_DIR,
  DOCS_DIR,
  GUIDE_MD,
  MANIFEST_PATH,
  SCREENSHOTS_DIR,
  CAPTURE_REPORT_PATH,
  VIEWPORT,
  PILOT_TITLES,
};

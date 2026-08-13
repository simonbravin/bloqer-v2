#!/usr/bin/env node
/**
 * Replaces validated capture blockquotes with markdown image references.
 * Idempotent: preserves already-applied `<!-- capture:ID -->` image blocks.
 * Usage: node docs/bloqer2.0/guides/capture/apply-images-to-md.js [--pilot] [--dry-run]
 */
const fs = require("fs");
const path = require("path");
const { GUIDE_MD, MANIFEST_PATH, SCREENSHOTS_DIR } = require("./paths");

function buildReplacement(capture) {
  const alt = `Bloqer — ${capture.title}`;
  const img = `![${alt}](${capture.relativePath})`;
  const caption = `*${capture.title}.*`;
  return [
    `<!-- capture:${capture.id} ${capture.slug} -->`,
    img,
    "",
    caption,
  ].join("\n");
}

function applyToMarkdown(md, okCaptures) {
  const okByTitle = new Map(okCaptures.map((c) => [c.title, c]));
  const okById = new Map(okCaptures.map((c) => [c.id, c]));
  const lines = md.split(/\r?\n/);
  const out = [];
  let replaced = 0;
  let refreshed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const captureComment = line.trim().match(/^<!--\s*capture:(\d+)\s+([^\s>]+)\s*-->$/);

    if (captureComment) {
      const id = captureComment[1];
      const slug = captureComment[2];
      const capture = okById.get(id);
      // Skip existing image/caption lines belonging to this block.
      let j = i + 1;
      while (
        j < lines.length &&
        !/^<!--\s*capture:/.test(lines[j].trim()) &&
        !/^>\s*\*{0,2}\s*📷\s*Captura sugerida/i.test(lines[j]) &&
        !/^##\s/.test(lines[j])
      ) {
        // Stop before the next major section if we hit a blank followed by non-caption content
        // that isn't part of the image block (image, blank, italic caption).
        if (
          lines[j].trim() === "" &&
          j + 1 < lines.length &&
          !/^!\[[^\]]*\]\(/.test(lines[j + 1]) &&
          !/^\*[^*].*\*$/.test(lines[j + 1].trim()) &&
          !/^<!--\s*capture:/.test(lines[j + 1].trim())
        ) {
          // Keep a single trailing blank after the block by not consuming it here.
          break;
        }
        j++;
        // Safety: image block is at most a few lines.
        if (j - i > 6) break;
      }

      if (capture) {
        out.push(buildReplacement(capture));
        refreshed++;
      } else {
        // Keep whatever was already there if capture is not currently OK.
        for (let k = i; k < j; k++) out.push(lines[k]);
      }
      i = j - 1;
      continue;
    }

    if (!/^>\s*\*{0,2}\s*📷\s*Captura sugerida/i.test(line)) {
      out.push(line);
      continue;
    }

    const blockStart = i;
    const block = [line];
    i++;
    while (i < lines.length && /^>/.test(lines[i])) {
      block.push(lines[i]);
      i++;
    }
    i--;

    const blockText = block.map((l) => l.replace(/^>\s?/, "").replace(/\s+$/, ""));
    const titleM = blockText[0].match(/📷\s*Captura sugerida\s*[—–-]\s*(.+?)\s*\*{0,2}$/i);
    const title = titleM ? titleM[1].trim() : null;
    const capture = title ? okByTitle.get(title) : null;

    if (capture && capture.internalOnly) {
      continue;
    }
    if (capture) {
      out.push(buildReplacement(capture));
      replaced++;
    } else {
      const blob = block.join(" ").toLowerCase();
      if (/\/platform\/|no entregar al cliente|proveedor saas|superadmin/.test(blob)) {
        continue;
      }
      for (let j = blockStart; j <= i; j++) out.push(lines[j]);
    }
  }

  return { md: out.join("\n"), replaced, refreshed };
}

function main() {
  const pilotOnly = process.argv.includes("--pilot");
  const dryRun = process.argv.includes("--dry-run");

  const validationPath = path.join(path.dirname(MANIFEST_PATH), "capture-validation.json");
  if (!fs.existsSync(validationPath)) {
    console.error("Run validate-screenshots.js first.");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const validation = JSON.parse(fs.readFileSync(validationPath, "utf8"));
  const okIds = new Set(validation.okCaptureIds || []);

  let okCaptures = manifest.captures.filter((c) => okIds.has(c.id));
  if (pilotOnly) okCaptures = okCaptures.filter((c) => c.pilot);

  okCaptures = okCaptures.filter((c) => {
    const fp = path.join(SCREENSHOTS_DIR, c.filename);
    return fs.existsSync(fp) && !c.internalOnly;
  });

  // Prefer restoring blockquotes from git HEAD when the working copy lost them.
  let md = fs.readFileSync(GUIDE_MD, "utf8");
  const existingImages = (md.match(/<!--\s*capture:/g) || []).length;
  const remainingBlockquotes = (md.match(/^>\s*\*{0,2}\s*📷\s*Captura sugerida/gim) || []).length;
  if (existingImages < okCaptures.length && remainingBlockquotes < okCaptures.length) {
    try {
      const { execSync } = require("child_process");
      const fromGit = execSync("git show HEAD:docs/bloqer2.0/GUIA_OPERATIVA_BLOQER_V2.md", {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
      const gitBlocks = (fromGit.match(/^>\s*\*{0,2}\s*📷\s*Captura sugerida/gim) || []).length;
      if (gitBlocks > remainingBlockquotes) {
        console.log(
          `Restoring guide MD from git HEAD (${gitBlocks} capture blockquotes) before applying images.`,
        );
        md = fromGit;
      }
    } catch {
      // Keep working copy if git restore fails.
    }
  }

  const { md: next, replaced, refreshed } = applyToMarkdown(md, okCaptures);

  console.log(`Captures eligible: ${okCaptures.length}`);
  console.log(`Blockquotes replaced: ${replaced}`);
  console.log(`Existing image blocks refreshed: ${refreshed}`);

  if (!dryRun && (replaced > 0 || refreshed > 0)) {
    fs.writeFileSync(GUIDE_MD, next, "utf8");
    console.log(`Updated: ${GUIDE_MD}`);
  } else if (dryRun) {
    console.log("Dry run — MD not modified");
  }
}

main();

#!/usr/bin/env node
/**
 * Generate placeholder extension icons (turquoise rounded square with
 * white "MT" wordmark) at the sizes declared in manifest.json.
 *
 * Runs standalone: `node scripts/generate-icons.mjs`
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });

const SIZES = [16, 32, 48, 128];
const BG = "#3DD9B3";
const FG = "#FFFFFF";

/** Build an SVG of the given size: rounded square bg + centered "MT". */
function buildSvg(size) {
  // Corner radius ~18% of edge, font ~56% of edge. At 16px this still
  // renders legibly thanks to sharp's anti-aliasing.
  const radius = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.56);
  // Push baseline slightly below center so the cap-height sits visually
  // centered. `dominant-baseline="central"` is inconsistent across
  // renderers, so we compute an explicit y offset.
  const y = Math.round(size * 0.5 + fontSize * 0.35);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${BG}"/>
  <text
    x="50%"
    y="${y}"
    text-anchor="middle"
    font-family="DM Sans, Inter, Helvetica, Arial, sans-serif"
    font-weight="700"
    font-size="${fontSize}"
    fill="${FG}"
    letter-spacing="${-Math.round(size * 0.02)}"
  >MT</text>
</svg>`;
}

async function main() {
  for (const size of SIZES) {
    const svg = Buffer.from(buildSvg(size));
    const outPath = resolve(outDir, `icon${size}.png`);
    await sharp(svg, { density: 384 })
      .resize(size, size, { fit: "contain" })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log(`wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

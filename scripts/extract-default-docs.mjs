#!/usr/bin/env node
/**
 * Extrait les liens « Documents et liens utiles » statiques de
 * formation-detail.html pour chaque couple slug|ville et écrit
 * src/data/formation-default-docs.json (consommé côté serveur pour
 * seeder la table documents_utiles).
 *
 * Lance : node scripts/extract-default-docs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "formation-detail.html"), "utf8");

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&rsquo;/g, "’")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

const sheetRe =
  /<article[^>]*data-formation-detail-sheet="([^"]+)"[\s\S]*?(?=<article[^>]*data-formation-detail-sheet="|<\/main>)/g;
const gridRe = /<div class="formation-detail-sheet__links-grid">([\s\S]*?)<\/div>/;
const aRe = /<a[^>]*\sclass="btn btn--outline"[^>]*\shref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

const out = {};
for (const m of HTML.matchAll(sheetRe)) {
  const key = m[1].trim();
  const block = m[0];
  const grid = block.match(gridRe);
  if (!grid) continue;
  const arr = [];
  let am;
  let i = 0;
  while ((am = aRe.exec(grid[1])) != null) {
    const href = am[1].trim();
    const label = stripTags(am[2]);
    if (!href || !label) continue;
    arr.push({
      label,
      url: href,
      type: /^https?:\/\//i.test(href) ? "lien" : "lien",
      ordre: ++i * 10,
      bouton_variante: "outline",
    });
  }
  if (arr.length) out[key] = arr;
}

const outDir = path.join(ROOT, "src", "data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "formation-default-docs.json"),
  JSON.stringify(out, null, 2) + "\n",
  "utf8"
);

console.log(
  `[extract-default-docs] ${Object.keys(out).length} couples slug|ville · ` +
    `${Object.values(out).reduce((s, a) => s + a.length, 0)} liens extraits.`
);

#!/usr/bin/env node
/**
 * Retire le menu déroulant « À Propos » (desktop + mobile) et les liens
 * pied de page « À Propos » pointant vers a-propos.html.
 * Ne modifie pas admin.html ni login.html.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SKIP = new Set(["admin.html", "login.html"]);

const deskRe =
  /<li class="nav__item">\s*<button class="nav__menu-button"[^>]*>[\s\S]*?À Propos[\s\S]*?<\/button>\s*<div class="nav__dropdown"[^>]*>[\s\S]*?<\/div>\s*<\/li>\s*/g;

const mobRe =
  /<li>\s*<details>[\s\S]*?<summary class="mobile-nav__summary">À Propos[\s\S]*?<\/details>\s*<\/li>\s*/g;

const footRe =
  /<li><a href="[^"]*a-propos\.html">À [Pp]ropos<\/a><\/li>\s*/g;

for (const name of fs.readdirSync(ROOT)) {
  if (!name.endsWith(".html") || SKIP.has(name)) continue;
  const filePath = path.join(ROOT, name);
  let html = fs.readFileSync(filePath, "utf8");
  const before = html;
  html = html.replace(deskRe, "").replace(mobRe, "").replace(footRe, "");
  if (html !== before) {
    fs.writeFileSync(filePath, html);
    console.log("mis à jour:", name);
  }
}

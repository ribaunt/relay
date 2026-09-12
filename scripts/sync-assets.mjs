#!/usr/bin/env node
// Copies shared brand assets into each app's public/brand dir.
// Next.js/Vercel can't follow symlinks in public/, so we materialize real
// files at dev/build time. Source of truth: packages/@relay/assets/
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "packages/@relay/assets");

const APPS = ["auth", "id", "home"];
const SKIP = new Set(["package.json", "README.md"]);

if (!existsSync(src)) {
  console.error("sync-assets: source folder missing:", src);
  process.exit(1);
}

const files = readdirSync(src, { withFileTypes: true })
  .filter((e) => e.isFile() && !SKIP.has(e.name))
  .map((e) => e.name);

for (const app of APPS) {
  const dest = resolve(root, `apps/${app}/public/brand`);
  mkdirSync(dest, { recursive: true });
  for (const file of files) {
    cpSync(resolve(src, file), resolve(dest, file));
  }
  console.log(`sync-assets: ${files.length} file(s) -> apps/${app}/public/brand/`);
}

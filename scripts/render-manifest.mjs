#!/usr/bin/env node
// Thin CLI to render a manifest.json to MP4 using the selected compositor adapter (default: remotion).
// Usage: node scripts/render-manifest.mjs <manifest.json | project-dir> --out <out.mp4> [--format 16:9] [--concurrency 4]
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const target = args.find((x, i) => !x.startsWith("--") && !(args[i - 1] ?? "").startsWith("--"));

if (!target) {
  process.stderr.write("usage: node scripts/render-manifest.mjs <manifest.json | project-dir> [--out out.mp4] [--format 16:9] [--concurrency N]\n");
  process.exit(2);
}

let manifestPath = resolve(target);
if (existsSync(manifestPath) && statSync(manifestPath).isDirectory()) {
  manifestPath = join(manifestPath, "manifest.json");
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const format = opt("--format", manifest.format?.[0] || "16:9");
const outPath = resolve(opt("--out", join(dirname(manifestPath), "output", `${manifest.title || "video"}-${format.replace(":", "x")}.mp4`)));
const concurrency = opt("--concurrency", null);

const compositorName = manifest.compositor || "remotion";
const reg = JSON.parse(readFileSync(join(ROOT, "providers/providers.json"), "utf8"));
const adapterRel = reg.capabilities?.compositor?.adapters?.[compositorName]?.path;
if (!adapterRel) {
  process.stderr.write(`Unknown compositor: ${compositorName}\n`);
  process.exit(2);
}

const payload = {
  manifest_path: manifestPath,
  format,
  out_path: outPath,
  ...(concurrency ? { concurrency: Number(concurrency) } : {}),
};

const out = execFileSync("node", [join(ROOT, adapterRel)], {
  input: JSON.stringify(payload),
  encoding: "utf8",
  stdio: ["pipe", "pipe", "inherit"],
});
process.stdout.write(out);

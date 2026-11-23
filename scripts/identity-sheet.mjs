#!/usr/bin/env node
// Build a 20-shot identity sheet from ONE source photograph.
//
// Why: a single reference image is enough to start, but multi-shot work drifts because the
// model has only seen the subject once, from one angle. Generating a consistent set of
// angles and expressions first, then feeding several of them as `refs[]`, is what keeps a
// face stable across a film. See skills/identity-sheet/SKILL.md.
//
// Usage:
//   node scripts/identity-sheet.mjs --source photo.jpg --out identity/me \
//        [--adapter nano-banana-pro] [--aspect 1:1] [--only 01,02,05] [--force] [--dry-run] [--json]
//
// Resumable: an existing output file is skipped unless --force. A failed shot is recorded and
// the run continues, so one provider hiccup does not waste the other nineteen calls.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS = join(
  ROOT,
  "skills/identity-sheet/prompts/identity-sheet.v1.json",
);
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 2) => {
  log("identity-sheet: " + m);
  process.exit(c);
};

function parseArgs(argv) {
  const opts = {};
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (
      a === "--force" ||
      a === "--dry-run" ||
      a === "--json" ||
      a === "--help" ||
      a === "-h"
    ) {
      flags.add(a);
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--"))
        fail(`--${key} needs a value`);
      opts[key] = val;
      i++;
    } else {
      fail(`unexpected argument: ${a}`);
    }
  }
  return { opts, flags };
}

function usage() {
  log(
    [
      "Usage:",
      "  node scripts/identity-sheet.mjs --source <photo> --out <dir> [--adapter <name>]",
      "                                   [--aspect 1:1] [--only 01,02] [--force] [--dry-run] [--json]",
      "",
      "Adapters are the image capability from providers/providers.json.",
      "Default adapter: gpt-image-2.6-sunburst (~$0.02/shot, #1 on the AA image board).",
      "--adapter nano-banana-pro is the 2K alternative (~$0.134/shot); a full 20-shot",
      "sheet therefore costs roughly $0.40 or $2.68.",
    ].join("\n"),
  );
}

function sha256(path) {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex")
    .slice(0, 16);
}

const { opts, flags } = parseArgs(process.argv.slice(2));
if (flags.has("--help") || flags.has("-h")) {
  usage();
  process.exit(0);
}

const source = opts.source;
const outDir = resolve(opts.out || "identity-sheet");
if (!source) fail("--source <photo> is required");
if (!existsSync(source)) fail(`source photo not found: ${source}`);

const reg = JSON.parse(
  readFileSync(join(ROOT, "providers/providers.json"), "utf8"),
);
// Cheap by default, matching the registry's `image` default. Identity quality is worth the
// 4x Pro price, but that is the caller's call (~$2.68 for the full sheet), not a default.
const adapterName = opts.adapter || reg.capabilities.image.default;
const adapter = reg.capabilities.image.adapters[adapterName];
if (!adapter) {
  fail(
    `unknown image adapter "${adapterName}". Known: ${Object.keys(reg.capabilities.image.adapters).join(", ")}`,
  );
}
const adapterPath = join(ROOT, adapter.path);

const spec = JSON.parse(readFileSync(PROMPTS, "utf8"));
const only = opts.only
  ? new Set(
      String(opts.only)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;
const shots = spec.shots.filter(
  (s) => !only || only.has(s.id) || only.has(s.slug),
);
if (!shots.length)
  fail(
    `--only matched no shots (ids ${spec.shots[0].id}-${spec.shots[spec.shots.length - 1]})`,
  );

const aspect = opts.aspect || "1:1";
const briefFor = (shot) =>
  [
    spec.identity_lock,
    shot.prompt,
    spec.camera,
    spec.lighting,
    "No text, no watermark.",
  ].join(" ");

mkdirSync(outDir, { recursive: true });

const record = {
  version: spec.version,
  built_at: new Date().toISOString(),
  source: resolve(source),
  source_sha256_16: sha256(source),
  adapter: adapterName,
  aspect,
  shots: [],
};

log(
  `identity sheet: ${shots.length} shot(s) from ${basename(source)} via ${adapterName} (${aspect})`,
);
if (flags.has("--dry-run")) {
  for (const shot of shots)
    log(`  ${shot.id} ${shot.slug}: ${briefFor(shot).slice(0, 90)}...`);
  process.exit(0);
}

let failed = 0;
for (const shot of shots) {
  const file = join(outDir, `${shot.id}-${shot.slug}.png`);
  const entry = {
    id: shot.id,
    slug: shot.slug,
    out_path: file,
    prompt: shot.prompt,
  };

  if (existsSync(file) && !flags.has("--force")) {
    entry.status = "skipped (exists)";
    record.shots.push(entry);
    log(`  ${shot.id} skipped (exists)`);
    continue;
  }

  try {
    const res = JSON.parse(
      execFileSync("node", [adapterPath], {
        input: JSON.stringify({
          brief: briefFor(shot),
          aspect,
          refs: [resolve(source)],
          out_path: file,
        }),
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }),
    );
    entry.status = "ok";
    entry.refs_used = res.refs_used ?? 1;
    if (res.cost_usd !== undefined) entry.cost_usd = res.cost_usd;
    log(`  ${shot.id} ok  ${shot.slug}`);
  } catch (e) {
    failed++;
    entry.status = "failed";
    entry.error = String(e.stderr || e.message || e)
      .trim()
      .slice(0, 400);
    log(`  ${shot.id} FAILED ${shot.slug}: ${entry.error.split("\n").pop()}`);
  }
  record.shots.push(entry);
}

const manifestPath = join(outDir, "identity-sheet.json");
writeFileSync(manifestPath, JSON.stringify(record, null, 2) + "\n");
const ok = record.shots.filter((s) => s.status === "ok").length;
log(`wrote ${manifestPath} (${ok} generated, ${failed} failed)`);
if (flags.has("--json"))
  process.stdout.write(JSON.stringify(record, null, 2) + "\n");
else process.stdout.write(manifestPath + "\n");
process.exit(failed ? 1 : 0);

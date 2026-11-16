#!/usr/bin/env node
// Per-shot markdown table built from take records (scripts/take-record.mjs) and, optionally,
// the manifest: shot, time, start still, takes, prompt file, verdict, lip-sync figure, cost.
//
// usage: node scripts/shot-table.mjs --dir <takes-dir> [--manifest manifest.json] [--out table.md] [--title "..."]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listShots, listTakes } from "./take-record.mjs";

const USAGE = `usage: node scripts/shot-table.mjs --dir <takes-dir> [--manifest manifest.json] [--out table.md] [--title "..."]
  Builds a markdown table with one row per shot. Without --manifest the rows are the shots
  that have take records. A shot with no take is listed with verdict "missing".
`;

export function selectedTake(takes) {
  const usable = takes.filter((t) => t.verdict === "usable");
  return usable.length ? usable[usable.length - 1] : takes[takes.length - 1] ?? null;
}

const cell = (s) => String(s ?? "-").replace(/\|/g, "\\|").replace(/\n/g, " ");
const secs = (ms) => (ms / 1000).toFixed(2);

export function buildShotRows({ takesBy, scenes = null }) {
  const ids = scenes ? scenes.map((s) => s.id) : Object.keys(takesBy);
  return ids.map((id) => {
    const scene = scenes?.find((s) => s.id === id) ?? {};
    const takes = takesBy[id] ?? [];
    const sel = selectedTake(takes);
    const lip = sel?.lipsync?.corr != null
      ? `corr ${sel.lipsync.corr}${sel.lipsync.lag_s != null ? ` at lag ${sel.lipsync.lag_s} s` : ""}`
      : scene.requires_lipsync ? "not measured" : "-";
    const cost = takes.reduce((n, t) => n + (t.cost_estimate_usd ?? 0), 0);
    return {
      shot: id,
      time: scene.in_ms != null && scene.out_ms != null ? `${secs(scene.in_ms)}-${secs(scene.out_ms)}` : "-",
      still: scene.visual?.asset ?? "-",
      takes: takes.length,
      prompt: sel?.prompt_file ?? "-",
      verdict: sel?.verdict ?? (takes.length ? "pending" : "missing"),
      lipsync: lip,
      cost: takes.length ? cost.toFixed(2) : "-",
    };
  });
}

export function renderShotTable(rows, { title = "Per-shot table" } = {}) {
  const counts = {};
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const summary = Object.keys(counts).sort().map((k) => `${k} ${counts[k]}`).join(", ");
  const total = rows.reduce((n, r) => n + (r.cost === "-" ? 0 : Number(r.cost)), 0);
  const lines = [
    `# ${title}`,
    "",
    `Verdicts: ${summary || "none"} (total ${rows.length} shots). Estimated spend on recorded takes: ${total.toFixed(2)} USD.`,
    "`usable` = the clip is in the film. `redo`, `missing` and `pending` = the film keeps the start still.",
    "",
    "| Shot | Time (s) | Start still | Takes | Prompt file | Verdict | Lip-sync | Cost (USD) |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${[r.shot, r.time, r.still, r.takes, r.prompt, r.verdict, r.lipsync, r.cost].map(cell).join(" | ")} |`),
  ];
  return lines.join("\n") + "\n";
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] == null) {
      process.stderr.write(`bad argument: ${argv[i]}\n${USAGE}`);
      return 2;
    }
    o[argv[i].slice(2)] = argv[i + 1];
  }
  if (!o.dir) {
    process.stderr.write(`--dir is required\n${USAGE}`);
    return 2;
  }
  try {
    let scenes = null;
    if (o.manifest) {
      if (!existsSync(resolve(o.manifest))) throw new Error(`manifest not found: ${o.manifest}`);
      scenes = JSON.parse(readFileSync(resolve(o.manifest), "utf8")).scenes ?? [];
    }
    const takesBy = {};
    for (const s of listShots(o.dir)) takesBy[s] = listTakes(o.dir, s);
    const md = renderShotTable(buildShotRows({ takesBy, scenes }), { title: o.title });
    if (o.out) writeFileSync(resolve(o.out), md);
    else process.stdout.write(md);
    return 0;
  } catch (e) {
    process.stderr.write(`shot-table: ${e.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

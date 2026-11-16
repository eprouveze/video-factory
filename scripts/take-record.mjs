#!/usr/bin/env node
// One JSON record per generated take, written BEFORE or right after the paid call, never
// without the prompt that produced it. Layout: <dir>/<shot-id>/take-tNN.json
//
// usage:
//   node scripts/take-record.mjs write --dir takes --shot S012 --model <id> --resolution 768p
//        --duration 5 --prompt-file <file> [--ref <path> ...] [--cost 0.40] [--result <clip>]
//        [--take N] [--verdict usable|redo|missing] [--max-takes 3] [--allow-extra]
//   node scripts/take-record.mjs read  --dir takes --shot S012 [--take N]
//   node scripts/take-record.mjs list  --dir takes [--shot S012]
//   node scripts/take-record.mjs set   --dir takes --shot S012 --take N [--verdict v] [--result p]
//        [--corr 0.41 --lag 0.04] [--cost c] [--note text]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VERDICTS = ["usable", "redo", "missing"];
export const DEFAULT_MAX_TAKES = 3;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

const USAGE = `usage: node scripts/take-record.mjs <write|read|list|set> --dir <takes-dir> [options]
  write  --shot ID --model M --resolution R --duration S --prompt-file F [--ref P ...]
         [--cost USD] [--result P] [--take N] [--verdict usable|redo|missing]
         [--max-takes 3] [--allow-extra]
         refuses when the prompt file does not exist, when the take already has a record,
         and when the shot already has --max-takes records (--allow-extra only after a human said yes)
  read   --shot ID [--take N]        print one record (default: the latest take)
  list   [--shot ID]                 print every record as a JSON array
  set    --shot ID --take N [--verdict v] [--result P] [--cost USD] [--corr X --lag S] [--note T]
`;

const pad = (n) => String(n).padStart(2, "0");
const shotDir = (dir, shot) => join(resolve(dir), shot);
const takePath = (dir, shot, take) => join(shotDir(dir, shot), `take-t${pad(take)}.json`);

function checkShot(shot) {
  if (!shot || !ID_RE.test(shot)) throw new Error(`invalid shot id: ${JSON.stringify(shot)}`);
}

export function listTakes(dir, shot) {
  checkShot(shot);
  const d = shotDir(dir, shot);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => /^take-t\d+\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(d, f), "utf8")))
    .sort((a, b) => a.take - b.take);
}

export function listShots(dir) {
  const root = resolve(dir);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((f) => statSync(join(root, f)).isDirectory() && ID_RE.test(f))
    .sort();
}

export function readTake(dir, shot, take) {
  checkShot(shot);
  const takes = listTakes(dir, shot);
  if (take == null) {
    if (!takes.length) throw new Error(`no takes recorded for shot ${shot}`);
    return takes[takes.length - 1];
  }
  const t = takes.find((x) => x.take === Number(take));
  if (!t) throw new Error(`no record for shot ${shot} take ${take}`);
  return t;
}

export function writeTake(dir, input, { maxTakes = DEFAULT_MAX_TAKES, allowExtra = false, now = new Date() } = {}) {
  const need = (k) => {
    if (input[k] == null || input[k] === "") throw new Error(`missing required field: ${k}`);
  };
  checkShot(input.shot_id);
  ["model", "resolution", "duration_s", "prompt_file"].forEach(need);
  if (!existsSync(resolve(input.prompt_file)) || !statSync(resolve(input.prompt_file)).isFile()) {
    throw new Error(`prompt file does not exist: ${input.prompt_file} (save the prompt before generating)`);
  }
  const duration = Number(input.duration_s);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("duration_s must be a positive number");
  if (input.verdict != null && !VERDICTS.includes(input.verdict)) {
    throw new Error(`verdict must be one of ${VERDICTS.join(", ")}`);
  }
  const existing = listTakes(dir, input.shot_id);
  const take = input.take != null ? Number(input.take) : existing.length + 1;
  if (!Number.isInteger(take) || take < 1) throw new Error("take must be a positive integer");
  if (existing.some((t) => t.take === take)) {
    throw new Error(`shot ${input.shot_id} take ${take} already has a record (no silent re-generation: use the next take)`);
  }
  if (existing.length >= maxTakes && !allowExtra) {
    throw new Error(
      `shot ${input.shot_id} already has ${existing.length} takes (max ${maxTakes}); ask a human before take ${take}, then pass --allow-extra`,
    );
  }
  const promptBytes = readFileSync(resolve(input.prompt_file));
  const rec = {
    shot_id: input.shot_id,
    take,
    model: input.model,
    resolution: input.resolution,
    duration_s: duration,
    prompt_file: input.prompt_file,
    prompt_sha256: createHash("sha256").update(promptBytes).digest("hex"),
    reference_paths: input.reference_paths ?? [],
    cost_estimate_usd: input.cost_estimate_usd != null ? numberOrThrow(input.cost_estimate_usd, "cost estimate") : null,
    result_path: input.result_path ?? null,
    verdict: input.verdict ?? null,
    created_utc: now.toISOString(),
  };
  mkdirSync(shotDir(dir, input.shot_id), { recursive: true });
  writeFileSync(takePath(dir, input.shot_id, take), JSON.stringify(rec, null, 2) + "\n", { flag: "wx" });
  return rec;
}

export function updateTake(dir, shot, take, patch) {
  const rec = readTake(dir, shot, take);
  if (patch.verdict != null && !VERDICTS.includes(patch.verdict)) {
    throw new Error(`verdict must be one of ${VERDICTS.join(", ")}`);
  }
  for (const k of ["verdict", "result_path", "note"]) if (patch[k] != null) rec[k] = patch[k];
  if (patch.cost_estimate_usd != null) rec.cost_estimate_usd = Number(patch.cost_estimate_usd);
  if (patch.lipsync_corr != null) {
    rec.lipsync = { corr: Number(patch.lipsync_corr), ...(patch.lipsync_lag_s != null ? { lag_s: Number(patch.lipsync_lag_s) } : {}) };
  }
  writeFileSync(takePath(dir, shot, rec.take), JSON.stringify(rec, null, 2) + "\n");
  return rec;
}

function parseArgs(argv) {
  const opts = { ref: [] };
  const flags = new Set(["--allow-extra"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument: ${a}`);
    if (flags.has(a)) {
      opts[a.slice(2)] = true;
      continue;
    }
    const v = argv[++i];
    if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`);
    if (a === "--ref") opts.ref.push(v);
    else opts[a.slice(2)] = v;
  }
  return opts;
}

function main(argv) {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return argv.length ? 0 : 2;
  }
  const [cmd, ...rest] = argv;
  if (!["write", "read", "list", "set"].includes(cmd)) {
    process.stderr.write(`unknown command: ${cmd}\n${USAGE}`);
    return 2;
  }
  let o;
  try {
    o = parseArgs(rest);
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}`);
    return 2;
  }
  if (!o.dir) {
    process.stderr.write(`--dir is required\n${USAGE}`);
    return 2;
  }
  try {
    if (cmd === "write") {
      const maxTakes = o["max-takes"] != null ? Number(o["max-takes"]) : DEFAULT_MAX_TAKES;
      if (!Number.isInteger(maxTakes) || maxTakes < 1) throw new Error("--max-takes must be a positive integer");
      const rec = writeTake(
        o.dir,
        {
          shot_id: o.shot,
          model: o.model,
          resolution: o.resolution,
          duration_s: o.duration,
          prompt_file: o["prompt-file"],
          reference_paths: o.ref,
          cost_estimate_usd: o.cost,
          result_path: o.result,
          take: o.take,
          verdict: o.verdict,
        },
        { maxTakes, allowExtra: !!o["allow-extra"] },
      );
      process.stdout.write(JSON.stringify(rec, null, 2) + "\n");
    } else if (cmd === "read") {
      process.stdout.write(JSON.stringify(readTake(o.dir, o.shot, o.take), null, 2) + "\n");
    } else if (cmd === "list") {
      const shots = o.shot ? [o.shot] : listShots(o.dir);
      process.stdout.write(JSON.stringify(shots.flatMap((s) => listTakes(o.dir, s)), null, 2) + "\n");
    } else {
      if (o.take == null) throw new Error("--take is required for set");
      const rec = updateTake(o.dir, o.shot, Number(o.take), {
        verdict: o.verdict,
        result_path: o.result,
        cost_estimate_usd: o.cost,
        lipsync_corr: o.corr,
        lipsync_lag_s: o.lag,
        note: o.note,
      });
      process.stdout.write(JSON.stringify(rec, null, 2) + "\n");
    }
    return 0;
  } catch (e) {
    process.stderr.write(`take-record: ${e.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

function numberOrThrow(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} is not a number: ${value}`);
  return n;
}

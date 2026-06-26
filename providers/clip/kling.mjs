#!/usr/bin/env node
// clip adapter — Kling (official single-key API). Contract: providers/CONTRACTS.md (clip).
// stdin  {brief, aspect?, duration_s?, ref_frame?, out_path}
// stdout {clip_path, duration_ms}
// Key from env KLING_API_KEY or .video-factory/config.json (clip.kling_api_key) — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("kling clip: " + m);
  process.exit(c);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function config() {
  const p = join(ROOT, ".video-factory", "config.json");
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

const cfg = config();
const key = process.env.KLING_API_KEY || cfg.clip?.kling_api_key;
if (!key)
  fail(
    "no Kling API key (env KLING_API_KEY or config clip.kling_api_key). Run :setup.",
    2,
  );

const req = JSON.parse(readFileSync(0, "utf8"));
if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

const BASE = cfg.clip?.kling_base || "https://api.klingai.com";
const model = cfg.clip?.kling_model || "kling-v2-6";
const aspect = req.aspect || "16:9";
const duration = req.duration_s && req.duration_s >= 10 ? "10" : "5";
const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const i2v = !!req.ref_frame;
const endpoint = i2v ? "/v1/videos/image2video" : "/v1/videos/text2video";
const body = {
  model_name: model,
  prompt: req.brief,
  duration,
  aspect_ratio: aspect,
  mode: cfg.clip?.kling_mode || "std",
};
if (i2v) body.image = readFileSync(resolve(req.ref_frame)).toString("base64");

async function api(method, path, payload) {
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    fail(`non-JSON from ${path} (${r.status}): ${t.slice(0, 200)}`);
  }
  return { ok: r.ok, status: r.status, j };
}

// submit
const sub = await api("POST", endpoint, body);
if (!sub.ok || sub.j.code !== 0) {
  fail(
    `submit ${sub.status} code=${sub.j?.code}: ${sub.j?.message || JSON.stringify(sub.j).slice(0, 200)}`,
  );
}
const taskId = sub.j.data?.task_id;
if (!taskId) fail("no task_id in submit response");
log(
  `submitted ${taskId} (${i2v ? "i2v" : "t2v"}, ${model}, ${duration}s ${aspect}), polling…`,
);

// poll until succeed/failed (download URL expires fast → grab immediately)
const pollPath = `${endpoint}/${taskId}`;
let videoUrl = null,
  durSec = parseFloat(duration);
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  await sleep(10000);
  const p = await api("GET", pollPath);
  const st = p.j.data?.task_status;
  if (st === "succeed") {
    const v = p.j.data?.task_result?.videos?.[0];
    if (!v?.url) fail("task succeeded but no video url");
    videoUrl = v.url;
    durSec = parseFloat(v.duration || duration);
    break;
  }
  if (st === "failed")
    fail(`task failed: ${p.j.data?.task_status_msg || "unknown"}`);
  log(`  status=${st}`);
}
if (!videoUrl) fail("timed out after 10min");

const vr = await fetch(videoUrl);
if (!vr.ok) fail(`download ${vr.status}`);
const out = resolve(req.out_path);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await vr.arrayBuffer()));

let duration_ms = Math.round(durSec * 1000);
try {
  const d = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nk=1:nw=1",
      out,
    ],
    { encoding: "utf8" },
  ).trim();
  duration_ms = Math.round(parseFloat(d) * 1000);
} catch {}

process.stdout.write(JSON.stringify({ clip_path: out, duration_ms }) + "\n");

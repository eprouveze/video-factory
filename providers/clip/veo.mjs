#!/usr/bin/env node
// clip adapter — Veo via Gemini API (predictLongRunning). Contract: providers/CONTRACTS.md (clip).
// stdin  {brief, aspect?, duration_s?, ref_frame?, out_path}
// stdout {clip_path, duration_ms}
// Key from env GEMINI_API_KEY or config GEMINI_API_KEY (x-goog-api-key header) — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("veo clip: " + m);
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
const key = process.env.GEMINI_API_KEY || cfg.GEMINI_API_KEY;
if (!key)
  fail(
    "no GEMINI_API_KEY (env or config). Veo needs a Gemini API key (aistudio.google.com).",
    2,
  );

const req = JSON.parse(readFileSync(0, "utf8"));
if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const model = cfg.clip?.veo_model || "veo-3.1-fast-generate-preview";
const aspect = req.aspect === "9:16" ? "9:16" : "16:9";
const dur = [4, 6, 8].includes(req.duration_s) ? req.duration_s : 8; // number — Veo rejects strings
const headers = { "Content-Type": "application/json", "x-goog-api-key": key };

const instance = { prompt: req.brief };
if (req.ref_frame)
  instance.image = {
    bytesBase64Encoded: readFileSync(resolve(req.ref_frame)).toString("base64"),
    mimeType: "image/png",
  };
const body = {
  instances: [instance],
  parameters: {
    aspectRatio: aspect,
    resolution: cfg.clip?.veo_resolution || "720p",
    durationSeconds: dur,
  },
};

async function call(method, url, payload) {
  const r = await fetch(url, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    fail(`non-JSON (${r.status}): ${t.slice(0, 200)}`);
  }
  return { ok: r.ok, status: r.status, j };
}

// recursively find a video uri / inline bytes anywhere in the response (shape varies by version)
function findVideo(obj) {
  let uri = null,
    bytes = null;
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (k === "uri" && typeof v === "string") uri = uri || v;
      if (
        (k === "videoBytes" || k === "bytesBase64Encoded") &&
        typeof v === "string"
      )
        bytes = bytes || v;
      if (v && typeof v === "object") walk(v);
    }
  })(obj);
  return { uri, bytes };
}

const sub = await call(
  "POST",
  `${BASE}/models/${model}:predictLongRunning`,
  body,
);
if (!sub.ok)
  fail(`submit ${sub.status}: ${JSON.stringify(sub.j).slice(0, 300)}`);
const opName = sub.j.name;
if (!opName) fail(`no operation name: ${JSON.stringify(sub.j).slice(0, 200)}`);
log(`submitted op ${opName}, polling…`);

let video = null;
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  await sleep(10000);
  const p = await call("GET", `${BASE}/${opName}`);
  if (p.j.error) fail(`op error: ${JSON.stringify(p.j.error).slice(0, 200)}`);
  if (p.j.done) {
    video = findVideo(p.j.response || p.j);
    if (!video.uri && !video.bytes)
      fail(`done but no video found in: ${JSON.stringify(p.j).slice(0, 400)}`);
    break;
  }
  log("  …processing");
}
if (!video) fail("timed out after 10min");

const out = resolve(req.out_path);
mkdirSync(dirname(out), { recursive: true });
if (video.bytes) {
  writeFileSync(out, Buffer.from(video.bytes, "base64"));
} else {
  const vr = await fetch(video.uri, { headers: { "x-goog-api-key": key } });
  if (!vr.ok) fail(`download ${vr.status}`);
  writeFileSync(out, Buffer.from(await vr.arrayBuffer()));
}

let duration_ms = dur * 1000;
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

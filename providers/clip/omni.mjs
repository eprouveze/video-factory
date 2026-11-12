#!/usr/bin/env node
// clip adapter — Gemini Omni via Interactions API. Contract: providers/CONTRACTS.md (clip).
// stdin  {brief, aspect?, duration_s?, ref_frame?, out_path}
// stdout {clip_path, duration_ms}
// Key from env GEMINI_API_KEY or config GEMINI_API_KEY (x-goog-api-key header) — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("omni clip: " + m);
  process.exit(c);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REF_FRAME_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function clampDuration(value) {
  const requested = Number(value);
  return Number.isFinite(requested)
    ? Math.min(15, Math.max(3, Math.round(requested)))
    : 8;
}

export function interactionState(j) {
  if (j?.status === "completed") return "done";
  if (j?.error || ["failed", "cancelled"].includes(j?.status)) return "failed";
  return "pending";
}

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

export function buildOmniRequest(req, cfg = {}) {
  const dur = clampDuration(req.duration_s);
  const input = req.ref_frame
    ? [
        {
          type: "image",
          data: readFileSync(resolve(req.ref_frame)).toString("base64"),
          mime_type:
            REF_FRAME_MIME[extname(req.ref_frame).toLowerCase()] || "image/png",
        },
        { type: "text", text: req.brief },
      ]
    : req.brief;
  const resolution =
    cfg.clip?.omni_resolution || cfg.clip?.veo_resolution || "720p";
  if (!cfg.clip?.omni_resolution && cfg.clip?.veo_resolution)
    log(
      "omni clip: clip.veo_resolution is renamed to clip.omni_resolution; using it.",
    );
  if (cfg.clip?.veo_model)
    log("omni clip: clip.veo_model is ignored; use clip.omni_model for Omni.");
  if (req.aspect && !["9:16", "16:9"].includes(req.aspect))
    log(
      `omni clip: aspect ${req.aspect} is unsupported; generating 16:9 and the compositor will crop it.`,
    );
  return {
    url: `${BASE}/interactions`,
    body: {
      model: cfg.clip?.omni_model || "gemini-omni-1.2-flash",
      input,
      response_format: {
        type: "video",
        aspect_ratio: req.aspect === "9:16" ? "9:16" : "16:9",
        resolution,
        duration: `${dur}s`,
        delivery: "uri",
      },
      background: false,
      store: true,
      stream: false,
    },
  };
}

export function findVideo(j) {
  for (const step of j.steps || []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content || []) {
      if (block.type === "video" && (block.data || block.uri)) return block;
    }
  }
  return null;
}

export function fileIdFromUri(uri) {
  return uri?.match(/(?:^|\/)files\/([^/:?]+)/)?.[1] || null;
}

async function main() {
  const cfg = config();
  const key = process.env.GEMINI_API_KEY || cfg.GEMINI_API_KEY;
  if (!key) fail("no GEMINI_API_KEY (env or config).", 2);

  const req = JSON.parse(readFileSync(0, "utf8"));
  if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

  const headers = { "Content-Type": "application/json", "x-goog-api-key": key };
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
    if (!r.ok)
      fail(`${method} ${url} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }

  const { url, body } = buildOmniRequest(req, cfg);
  let job = await call("POST", url, body);
  const jobDeadline = Date.now() + 10 * 60 * 1000;
  while (interactionState(job) === "pending" && !findVideo(job)) {
    if (!job.id)
      fail(`no video and no id to poll: ${JSON.stringify(job).slice(0, 400)}`);
    if (Date.now() >= jobDeadline) fail("timed out after 10min");
    log(`  …interaction ${job.status || "pending"}`);
    await sleep(5000);
    job = await call("GET", `${BASE}/interactions/${job.id}`);
  }
  if (interactionState(job) === "failed")
    fail(
      `interaction ${job.status}: ${JSON.stringify(job.error ?? job).slice(0, 300)}`,
    );
  const video = findVideo(job);
  if (!video)
    fail(`no video in response: ${JSON.stringify(job).slice(0, 400)}`);

  const out = resolve(req.out_path);
  mkdirSync(dirname(out), { recursive: true });
  if (video.data) {
    writeFileSync(out, Buffer.from(video.data, "base64"));
  } else {
    const fileId = fileIdFromUri(video.uri);
    if (!fileId) fail(`no file id in video uri: ${video.uri}`);
    const deadline = Date.now() + 10 * 60 * 1000;
    while (true) {
      const file = await call("GET", `${BASE}/files/${fileId}`);
      if (file.state === "ACTIVE") break;
      if (file.state === "FAILED") fail("video file processing failed");
      if (Date.now() >= deadline) fail("timed out after 10min");
      log("  …processing");
      await sleep(5000);
    }
    const vr = await fetch(`${BASE}/files/${fileId}:download?alt=media`, {
      headers,
    });
    if (!vr.ok) fail(`download ${vr.status}`);
    writeFileSync(out, Buffer.from(await vr.arrayBuffer()));
  }

  const dur = clampDuration(req.duration_s);
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
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();

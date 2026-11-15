#!/usr/bin/env node
// clip adapter — OpenRouter asynchronous Video Generation API (`POST /api/v1/videos`).
// Contract: providers/CONTRACTS.md (clip), extended for external audio passthrough,
// dry-run payload validation, cost guard, and redacted provenance logging.
// stdin  {brief, aspect?, duration_s?, resolution?, ref_frame?, last_frame?, audio_url?, audio_path?,
//         negative_prompt?, prompt_extend?, generate_audio?, seed?, max_cost_usd?,
//         dry_run?, allow_audio_data_uri?, provenance_path?, model?, out_path}
// stdout {clip_path, duration_ms, cost_usd?} or {dry_run: true, ...}
// Key from env OPENROUTER_API_KEY or .video-factory/config.json — never CLI args or request body.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://openrouter.ai/api/v1";
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("openrouter clip: " + m);
  process.exit(c);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const AUDIO_MIME = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};

// Sourced from GET https://openrouter.ai/api/v1/videos/models & /endpoints (2026-11-15)
export const OPENROUTER_VIDEO_CATALOG = {
  "alibaba/wan-2.7": {
    providerSlug: "atlas-cloud",
    durations: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    defaultDuration: 4,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    frameImages: ["first_frame", "last_frame"],
    passthrough: [
      "negative_prompt",
      "prompt_extend",
      "audio",
      "ratio",
      "last_image",
      "video",
      "videos",
      "images",
    ],
    supportsAudioInput: true,
    supportsGenerateAudioFlag: true,
    pricePerSec: { "720p": 0.1, "1080p": 0.1 },
  },
  "alibaba/wan-2.6": {
    providerSlug: "atlas-cloud",
    durations: [5, 10],
    defaultDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    aspects: ["16:9", "9:16"],
    frameImages: ["first_frame"],
    passthrough: [
      "negative_prompt",
      "enable_prompt_expansion",
      "shot_type",
      "audio",
      "size",
    ],
    supportsAudioInput: true,
    supportsGenerateAudioFlag: true,
    pricePerSec: {
      "720p": { t2v: 0.08, i2v: 0.1 },
      "1080p": { t2v: 0.12, i2v: 0.15 },
    },
  },
  "google/gemini-omni-1.2-flash": {
    providerSlug: null,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    defaultDuration: 5,
    resolutions: ["360p", "720p", "1080p", "4K"],
    defaultResolution: "720p",
    aspects: ["16:9", "9:16"],
    frameImages: ["first_frame", "last_frame"],
    passthrough: [],
    supportsAudioInput: false,
    supportsGenerateAudioFlag: true,
    pricePerSec: { "720p": 0.0695, "1080p": 0.1043 },
  },
  "minimax/hailuo-3-max": {
    providerSlug: "minimax",
    durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    defaultDuration: 5,
    resolutions: ["480p", "768p"],
    defaultResolution: "768p",
    aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    frameImages: ["first_frame", "last_frame"],
    passthrough: ["aigc_watermark"],
    supportsAudioInput: false,
    supportsGenerateAudioFlag: false,
    pricePerSec: { "480p": 0.05, "768p": 0.08 },
  },
  "bytedance/seedance-2.5": {
    providerSlug: "seed",
    durations: Array.from({ length: 27 }, (_, i) => i + 4),
    defaultDuration: 5,
    resolutions: ["480p", "720p"],
    defaultResolution: "720p",
    aspects: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
    frameImages: ["first_frame", "last_frame"],
    passthrough: ["watermark", "req_key"],
    supportsAudioInput: false,
    supportsGenerateAudioFlag: true,
    pricePerSec: null,
  },
};

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

function sha256File(filePath) {
  const h = createHash("sha256");
  h.update(readFileSync(filePath));
  return h.digest("hex");
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isHttpsUrl(value) {
  return typeof value === "string" && /^https:\/\//i.test(value);
}

export function clampDuration(value, model = "alibaba/wan-2.7") {
  const spec = OPENROUTER_VIDEO_CATALOG[model];
  const fallback = spec?.defaultDuration ?? 4;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (!spec?.durations?.length) return Math.max(2, Math.round(n));
  let best = spec.durations[0];
  let bestDist = Math.abs(n - best);
  for (const d of spec.durations) {
    const dist = Math.abs(n - d);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

export function estimateCostUsd(
  model,
  durationS,
  { resolution = "720p", isI2V = true } = {},
) {
  const spec = OPENROUTER_VIDEO_CATALOG[model];
  if (!spec?.pricePerSec) return null;
  const entry = spec.pricePerSec[resolution] ?? Object.values(spec.pricePerSec)[0];
  if (entry == null) return null;
  const rate = typeof entry === "number" ? entry : isI2V ? entry.i2v : entry.t2v;
  if (!Number.isFinite(rate)) return null;
  return Math.round(rate * durationS * 1e6) / 1e6;
}

export function enforceCostGuard(estCostUsd, maxCostUsd) {
  if (maxCostUsd === undefined || maxCostUsd === null) return;
  const cap = Number(maxCostUsd);
  if (!Number.isFinite(cap) || cap <= 0) {
    throw new Error(`Invalid max_cost_usd budget guard: ${maxCostUsd}`);
  }
  if (estCostUsd === null || estCostUsd === undefined) {
    throw new Error(
      `Model has token/unpriced billing; blocked under max_cost_usd=$${cap.toFixed(2)}`,
    );
  }
  if (estCostUsd > cap + 1e-9) {
    throw new Error(
      `Estimated cost $${estCostUsd.toFixed(4)} exceeds max_cost_usd=$${cap.toFixed(4)}`,
    );
  }
}

function resolveImageInput(frameRef, label, hashesOut) {
  if (isHttpUrl(frameRef)) {
    hashesOut[label] = { url: frameRef };
    return frameRef;
  }
  const abs = resolve(frameRef);
  if (!existsSync(abs)) {
    throw new Error(`${label} not found: ${frameRef}`);
  }
  const ext = extname(abs).toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) {
    throw new Error(`Unsupported ${label} image extension: ${ext}`);
  }
  const buf = readFileSync(abs);
  hashesOut[label] = {
    path: frameRef,
    sha256: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.length,
  };
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function resolveAudioInput(req, spec, dryRun, hashesOut) {
  const hasUrl = Boolean(req.audio_url);
  const hasPath = Boolean(req.audio_path);
  if (!hasUrl && !hasPath) return null;

  if (!spec?.supportsAudioInput) {
    throw new Error(
      `Model ${spec?.id || "selected model"} does not advertise external audio passthrough on OpenRouter`,
    );
  }

  if (hasPath) {
    const abs = resolve(req.audio_path);
    if (!existsSync(abs)) {
      throw new Error(`audio_path not found: ${req.audio_path}`);
    }
    const ext = extname(abs).toLowerCase();
    const mime = AUDIO_MIME[ext];
    if (!mime) {
      throw new Error(`Unsupported audio_path extension: ${ext}`);
    }
    const buf = readFileSync(abs);
    if (buf.length > 15 * 1024 * 1024) {
      throw new Error(`audio_path exceeds 15MB limit (${buf.length} bytes)`);
    }
    hashesOut.audio = {
      path: req.audio_path,
      sha256: createHash("sha256").update(buf).digest("hex"),
      bytes: buf.length,
    };
    if (!hasUrl) {
      if (req.allow_audio_data_uri) {
        return `data:${mime};base64,${buf.toString("base64")}`;
      }
      if (dryRun) {
        return `<HTTPS_URL_FOR:${basename(abs)}>`;
      }
      throw new Error(
        "OpenRouter audio passthrough requires public/signed HTTPS audio_url (pass audio_url or set dry_run: true for offline payload test)",
      );
    }
  }

  if (!isHttpsUrl(req.audio_url)) {
    throw new Error(`audio_url must be HTTPS: ${req.audio_url}`);
  }
  hashesOut.audio = { ...(hashesOut.audio || {}), url: req.audio_url };
  return req.audio_url;
}

export function buildOpenRouterVideoRequest(req, cfg = {}) {
  if (!req?.brief) throw new Error("request needs brief");
  const model = req.model || cfg.clip?.openrouter_model || "alibaba/wan-2.7";
  const spec = OPENROUTER_VIDEO_CATALOG[model];
  if (!spec) {
    throw new Error(
      `Unsupported OpenRouter video model in adapter catalog: ${model}`,
    );
  }
  const specWithId = { ...spec, id: model };
  const dryRun = Boolean(req.dry_run);
  const duration = clampDuration(req.duration_s, model);
  const resolution =
    req.resolution ||
    cfg.clip?.openrouter_resolution ||
    spec.defaultResolution ||
    "720p";
  if (spec.resolutions && !spec.resolutions.includes(resolution)) {
    throw new Error(
      `Resolution ${resolution} unsupported by ${model} (supported: ${spec.resolutions.join(", ")})`,
    );
  }
  const aspect = req.aspect || "16:9";
  if (spec.aspects && !spec.aspects.includes(aspect)) {
    throw new Error(
      `Aspect ${aspect} unsupported by ${model} (supported: ${spec.aspects.join(", ")})`,
    );
  }

  const refHashes = {};
  const frameImages = [];
  if (req.ref_frame) {
    frameImages.push({
      type: "image_url",
      image_url: { url: resolveImageInput(req.ref_frame, "first_frame", refHashes) },
      frame_type: "first_frame",
    });
  }
  if (req.last_frame) {
    if (!spec.frameImages.includes("last_frame")) {
      throw new Error(`Model ${model} does not support last_frame`);
    }
    frameImages.push({
      type: "image_url",
      image_url: { url: resolveImageInput(req.last_frame, "last_frame", refHashes) },
      frame_type: "last_frame",
    });
  }

  const audioRef = resolveAudioInput(req, specWithId, dryRun, refHashes);
  const estCostUsd = estimateCostUsd(model, duration, {
    resolution,
    isI2V: frameImages.length > 0,
  });
  enforceCostGuard(estCostUsd, req.max_cost_usd ?? cfg.clip?.max_cost_usd);

  const body = {
    model,
    prompt: req.brief,
    duration,
    resolution,
    aspect_ratio: aspect,
  };
  if (frameImages.length > 0) body.frame_images = frameImages;

  if (spec.supportsGenerateAudioFlag) {
    if (req.generate_audio !== undefined) {
      body.generate_audio = Boolean(req.generate_audio);
    } else if (audioRef) {
      // Never synthesize competing ambient audio when conditioning on external song track
      body.generate_audio = false;
    }
  }
  if (req.seed !== undefined && Number.isInteger(Number(req.seed))) {
    body.seed = Number(req.seed);
  }

  const providerOptions = {};
  if (audioRef) providerOptions.audio = audioRef;
  if (req.negative_prompt) {
    if (!spec.passthrough.includes("negative_prompt")) {
      throw new Error(`Model ${model} does not advertise negative_prompt passthrough`);
    }
    providerOptions.negative_prompt = req.negative_prompt;
  }
  if (req.prompt_extend !== undefined) {
    if (!spec.passthrough.includes("prompt_extend")) {
      throw new Error(`Model ${model} does not advertise prompt_extend passthrough`);
    }
    providerOptions.prompt_extend = Boolean(req.prompt_extend);
  }

  if (Object.keys(providerOptions).length > 0) {
    if (!spec.providerSlug) {
      throw new Error(`No verified provider slug configured for ${model}`);
    }
    body.provider = {
      order: [spec.providerSlug],
      options: {
        [spec.providerSlug]: providerOptions,
      },
    };
  }

  return {
    url: `${BASE}/videos`,
    body,
    model,
    providerSlug: spec.providerSlug,
    estCostUsd,
    refHashes,
  };
}

export function redactRequestForLog(value) {
  if (typeof value === "string") {
    const m = value.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      const buf = Buffer.from(m[2], "base64");
      const digest = createHash("sha256")
        .update(buf)
        .digest("hex")
        .slice(0, 12);
      return `<DATA_URI:${m[1]};bytes=${buf.length};sha256=${digest}>`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactRequestForLog);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactRequestForLog(v);
    }
    return out;
  }
  return value;
}

export function videoState(j) {
  if (!j) return "pending";
  if (j.status === "completed") return "done";
  if (["failed", "cancelled"].includes(j.status)) return "failed";
  return "pending";
}

export function videoError(j) {
  const e = j?.error;
  if (!e) return `status ${j?.status || "unknown"}`;
  if (typeof e === "string") return e;
  return [e.code, e.message].filter(Boolean).join(": ") || JSON.stringify(e);
}

export function videoResultUrl(j) {
  if (Array.isArray(j?.unsigned_urls) && j.unsigned_urls[0]) {
    return j.unsigned_urls[0];
  }
  return null;
}

function buildProvenance(built, req, extra = {}) {
  return {
    schema: "openrouter-video-provenance/v1",
    created_at: new Date().toISOString(),
    dry_run: Boolean(req.dry_run),
    endpoint: built.url,
    model: built.model,
    provider_slug: built.providerSlug,
    est_cost_usd: built.estCostUsd,
    refs: built.refHashes,
    request_redacted: redactRequestForLog(built.body),
    ...extra,
  };
}

async function main() {
  const dryFlag = process.argv.includes("--dry-run");
  const cfg = config();
  const req = JSON.parse(readFileSync(0, "utf8"));
  if (dryFlag) req.dry_run = true;
  if (!req.brief || !req.out_path) {
    fail("request needs {brief, out_path}", 2);
  }

  let built;
  try {
    built = buildOpenRouterVideoRequest(req, cfg);
  } catch (err) {
    fail(err.message, 2);
  }

  const provPath = req.provenance_path
    ? resolve(req.provenance_path)
    : `${resolve(req.out_path)}.provenance.json`;

  if (req.dry_run) {
    const prov = buildProvenance(built, req);
    mkdirSync(dirname(provPath), { recursive: true });
    writeFileSync(provPath, JSON.stringify(prov, null, 2) + "\n");
    process.stdout.write(
      JSON.stringify({
        dry_run: true,
        endpoint: built.url,
        model: built.model,
        provider_slug: built.providerSlug,
        est_cost_usd: built.estCostUsd,
        provenance_path: provPath,
        request_body: prov.request_redacted,
      }) + "\n",
    );
    return;
  }

  const out = resolve(req.out_path);
  if (existsSync(out)) {
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
      const ms = Math.round(parseFloat(d) * 1000);
      if (Number.isFinite(ms) && ms > 0) {
        log(`  reusing existing valid output ${out} (${ms} ms)`);
        process.stdout.write(
          JSON.stringify({ clip_path: out, duration_ms: ms }) + "\n",
        );
        return;
      }
    } catch {}
  }

  const key = process.env.OPENROUTER_API_KEY || cfg.OPENROUTER_API_KEY;
  if (!key) fail("no OPENROUTER_API_KEY (env or config).", 2);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  async function call(method, url, payload) {
    const r = await fetch(url, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      fail(`${method} ${url} non-JSON (${r.status}): ${text.slice(0, 200)}`);
    }
    if (!r.ok) {
      fail(
        `${method} ${url} ${r.status}: ${j?.error?.message || JSON.stringify(j).slice(0, 300)}`,
      );
    }
    return j;
  }

  const created = await call("POST", built.url, built.body);
  const jobId = created.id;
  const pollingUrl =
    created.polling_url || `${BASE}/videos/${encodeURIComponent(jobId)}`;
  if (!jobId) {
    fail(`no id in submit response: ${JSON.stringify(created).slice(0, 300)}`);
  }

  log(
    `  submitted job_id=${jobId} model=${built.model} est=$${built.estCostUsd ?? "?"} poll=${pollingUrl}`,
  );
  mkdirSync(dirname(provPath), { recursive: true });
  writeFileSync(
    provPath,
    JSON.stringify(
      buildProvenance(built, req, { job_id: jobId, polling_url: pollingUrl }),
      null,
      2,
    ) + "\n",
  );

  const deadline = Date.now() + 10 * 60 * 1000;
  let statusObj = null;
  while (true) {
    await sleep(10000);
    statusObj = await call("GET", pollingUrl);
    const st = videoState(statusObj);
    if (st === "done") break;
    if (st === "failed") {
      fail(`job ${jobId} failed: ${videoError(statusObj)}`);
    }
    if (Date.now() >= deadline) fail(`job ${jobId} timed out after 10min`);
    log(`  …job ${jobId} status=${statusObj?.status || "pending"}`);
  }

  const contentUrl = videoResultUrl(statusObj);
  if (!contentUrl) {
    fail(
      `job ${jobId} completed with no unsigned_urls: ${JSON.stringify(statusObj).slice(0, 300)}`,
    );
  }

  const vr = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(180000),
  });
  if (!vr.ok) fail(`download ${vr.status} (job_id=${jobId})`);
  const bytes = Buffer.from(await vr.arrayBuffer());
  if (bytes.length < 1000) {
    fail(`download too small (${bytes.length} bytes, job_id=${jobId})`);
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);

  let duration_ms = built.body.duration * 1000;
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
    const ms = Math.round(parseFloat(d) * 1000);
    if (Number.isFinite(ms)) duration_ms = ms;
  } catch {}

  const actualCost =
    typeof statusObj?.usage?.total_cost === "number"
      ? statusObj.usage.total_cost
      : built.estCostUsd;

  writeFileSync(
    provPath,
    JSON.stringify(
      buildProvenance(built, req, {
        job_id: jobId,
        generation_id: statusObj?.generation_id || null,
        polling_url: pollingUrl,
        clip_sha256: sha256File(out),
        duration_ms,
        cost_usd: actualCost,
      }),
      null,
      2,
    ) + "\n",
  );

  const outObj = { clip_path: out, duration_ms };
  if (typeof actualCost === "number") outObj.cost_usd = actualCost;
  process.stdout.write(JSON.stringify(outObj) + "\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}

#!/usr/bin/env node
// clip adapter: MiniMax H3 via the v2 video generation and regeneration APIs.
// Contract: providers/CONTRACTS.md (clip).
// stdin  {brief, aspect?, duration_s?, resolution?, ref_frame?, last_frame?, ref_images?, ref_audio?, ref_videos?, out_path}
//     or {source_task_id, resolution?, out_path}                                  (768P -> 2K regen by task id)
//     or {base_video, brief, ref_frame?, last_frame?, resolution?, generate_audio?, out_path}  (768P -> 2K regen by video)
// stdout {clip_path, duration_ms, task_id, cost_usd?}
// Pre-call gates (refused before any API call so bad requests are never billed):
//   - unfilled [UPPER_CASE] placeholders in brief
//   - mixing first/last frame with reference image/audio/video
//   - ref_images[] aspect ratio outside [0.4, 2.5]
//   - ref_audio[] non-.wav files
//   - ref_videos[] >3 files, non-.mp4/.mov, >50 MB, clip duration outside [2, 15] s, or total >15 s
// Key from env MINIMAX_API_KEY or config MINIMAX_API_KEY (Authorization: Bearer header), never CLI args.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://api.minimax.io";
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("minimax clip: " + m);
  process.exit(c);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REF_FRAME_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const REF_VIDEO_MIME = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};
const RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const MIN_DURATION = { "MiniMax-H3-Max": 5 };
const PRICE_PER_SECOND = {
  "MiniMax-H3": { "768P": 0.08, "2K": 0.13 },
  "MiniMax-H3-Highspeed": { "768P": 0.06, "480P": 0.04 },
  "MiniMax-H3-Lite": { "768P": 0.04, "480P": 0.025 },
  "MiniMax-H3-Max": { "768P": 0.08, "480P": 0.05 },
};

export const REF_IMAGE_RATIO = [0.4, 2.5];
export const MAX_REF_VIDEOS = 3;
export const MAX_REF_VIDEO_BYTES = 50 * 1024 * 1024;
export const REF_VIDEO_DURATION = [2, 15];
export const MAX_REF_VIDEO_TOTAL_S = 15;

export function checkPlaceholders(prompt) {
  if (typeof prompt !== "string") return;
  const matches = prompt.match(/\[[A-Z][A-Z0-9_]{2,}\]/g);
  if (!matches) return;
  const left = [...new Set(matches)].sort();
  throw new Error(
    `unfilled placeholder(s) ${left.join(", ")}: fill them before generating`,
  );
}

// Pixel size from the file header: PNG, JPEG, WebP. Returns null when unreadable.
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47)
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      while (i + 1 < buf.length && buf[i + 1] === 0xff) i++; // repeated 0xFF padding
      const m = buf[i + 1];
      if (m === 0x00 || m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
        i += 2; // stuffed byte or marker without a length
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m))
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  if (
    buf.length > 30 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const k = buf.toString("ascii", 12, 16);
    if (k === "VP8X")
      return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (k === "VP8 ")
      return {
        w: buf.readUInt16LE(26) & 0x3fff,
        h: buf.readUInt16LE(28) & 0x3fff,
      };
    if (k === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

export function checkRefImage(path) {
  if (!existsSync(resolve(path)))
    throw new Error(`reference image not found: ${path}`);
  const size = imageSize(readFileSync(resolve(path)));
  if (!size || !size.h)
    throw new Error(`cannot read reference image size: ${path}`);
  const r = size.w / size.h;
  if (r < REF_IMAGE_RATIO[0] || r > REF_IMAGE_RATIO[1])
    throw new Error(
      `reference image aspect ratio ${r.toFixed(2)} outside [${REF_IMAGE_RATIO.join(", ")}]: ${path}`,
    );
}

export function checkRefAudio(path) {
  if (extname(path).toLowerCase() !== ".wav")
    throw new Error(`reference audio must be .wav: ${path}`);
  if (!existsSync(resolve(path)))
    throw new Error(`reference audio not found: ${path}`);
}

export function probeVideoDuration(path) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      resolve(path),
    ],
    { encoding: "utf8" },
  ).trim();
  const d = parseFloat(out);
  if (!Number.isFinite(d))
    throw new Error(`cannot read reference video duration: ${path}`);
  return d;
}

export function checkRefVideos(paths, probe = probeVideoDuration) {
  if (paths.length > MAX_REF_VIDEOS)
    throw new Error(`at most ${MAX_REF_VIDEOS} reference videos`);
  let total = 0;
  for (const p of paths) {
    const ext = extname(p).toLowerCase();
    if (!REF_VIDEO_MIME[ext])
      throw new Error(`reference video must be .mp4 or .mov: ${p}`);
    const abs = resolve(p);
    if (!existsSync(abs)) throw new Error(`reference video not found: ${p}`);
    if (statSync(abs).size > MAX_REF_VIDEO_BYTES)
      throw new Error(`reference video over 50 MB: ${p}`);
    const d = probe(abs);
    if (!Number.isFinite(d) || d < REF_VIDEO_DURATION[0] || d > REF_VIDEO_DURATION[1])
      throw new Error(
        `reference video must last ${REF_VIDEO_DURATION[0]} to ${REF_VIDEO_DURATION[1]} s, got ${Number.isFinite(d) ? d.toFixed(2) : d} s: ${p}`,
      );
    total += d;
  }
  if (total > MAX_REF_VIDEO_TOTAL_S)
    throw new Error(
      `reference videos total ${total.toFixed(2)} s, limit is ${MAX_REF_VIDEO_TOTAL_S} s`,
    );
}

export function clampDuration(value, model = "MiniMax-H3") {
  const requested = Number(value);
  const min = MIN_DURATION[model] || 4;
  return Number.isFinite(requested)
    ? Math.min(15, Math.max(min, Math.round(requested)))
    : 8;
}

export function mapRatio(aspect) {
  if (!aspect) return "16:9";
  if (RATIOS.includes(aspect)) return aspect;
  log(
    `minimax clip: aspect ${aspect} is unsupported; generating 16:9 and the compositor will crop it.`,
  );
  return "16:9";
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

function imageDataUri(path, label) {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`${label} not found: ${path}`);
  const mime = REF_FRAME_MIME[extname(abs).toLowerCase()] || "image/png";
  return `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
}

function videoDataUri(path, label) {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`${label} not found: ${path}`);
  const mime = REF_VIDEO_MIME[extname(abs).toLowerCase()] || "video/mp4";
  return `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
}

// 768P -> 2K regeneration via /v2/video_regeneration, either by source_task_id or base_video.
export function buildMinimaxRegenRequest(req, cfg = {}) {
  const hasTask = Boolean(req.source_task_id);
  const hasBase = Boolean(req.base_video);
  if (hasTask === hasBase)
    throw new Error(
      "regen needs exactly one of source_task_id or base_video",
    );
  const model = cfg.clip?.minimax_model || "MiniMax-H3";
  const resolution = req.resolution || "2K";
  if (hasTask) {
    return {
      url: `${BASE}/v2/video_regeneration`,
      regen: true,
      body: {
        model,
        source_task_id: String(req.source_task_id),
        resolution,
      },
    };
  }
  if (!req.brief)
    throw new Error(
      "base_video regen requires brief (the prompt of the 768P run)",
    );
  checkPlaceholders(req.brief);
  const content = [
    { type: "text", text: req.brief },
    {
      type: "video_url",
      video_url: { url: videoDataUri(req.base_video, "base_video") },
      role: "base_video",
    },
  ];
  if (req.ref_frame) {
    content.push({
      type: "image_url",
      image_url: { url: imageDataUri(req.ref_frame, "ref_frame") },
      role: "first_frame",
    });
  }
  if (req.last_frame) {
    content.push({
      type: "image_url",
      image_url: { url: imageDataUri(req.last_frame, "last_frame") },
      role: "last_frame",
    });
  }
  return {
    url: `${BASE}/v2/video_regeneration`,
    regen: true,
    body: {
      model,
      content,
      resolution,
      generate_audio: Boolean(req.generate_audio),
    },
  };
}

export function buildMinimaxRequest(req, cfg = {}) {
  if (req.source_task_id || req.base_video)
    return buildMinimaxRegenRequest(req, cfg);

  checkPlaceholders(req.brief);
  const model = cfg.clip?.minimax_model || "MiniMax-H3";
  const content = [{ type: "text", text: req.brief }];
  const refImages = req.ref_images || [];
  const refAudio = req.ref_audio || [];
  const refVideos = req.ref_videos || [];
  const hasFrame = Boolean(req.ref_frame || req.last_frame);
  const hasRef = Boolean(refImages.length || refAudio.length || refVideos.length);

  if (hasFrame && hasRef)
    throw new Error(
      "H3 refuses first/last frame together with reference image/audio/video: choose one mode",
    );

  if (req.ref_frame) {
    content.push({
      type: "image_url",
      image_url: { url: imageDataUri(req.ref_frame, "ref_frame") },
      role: "first_frame",
    });
  }
  if (req.last_frame) {
    content.push({
      type: "image_url",
      image_url: { url: imageDataUri(req.last_frame, "last_frame") },
      role: "last_frame",
    });
  }
  for (const p of refImages) {
    checkRefImage(p);
    content.push({
      type: "image_url",
      image_url: { url: imageDataUri(p, "reference image") },
      role: "reference_image",
    });
  }
  for (const p of refAudio) {
    checkRefAudio(p);
    content.push({
      type: "audio_url",
      audio_url: {
        url: `data:audio/wav;base64,${readFileSync(resolve(p)).toString("base64")}`,
      },
      role: "reference_audio",
    });
  }
  if (refVideos.length) {
    checkRefVideos(refVideos, cfg._probeDuration || probeVideoDuration);
    for (const p of refVideos) {
      content.push({
        type: "video_url",
        video_url: { url: videoDataUri(p, "reference video") },
        role: "reference_video",
      });
    }
  }
  // MiniMax-H3-Lite does not support ratio "adaptive" for reference requests (vendor doc,
  // video-generation-v2-create): it needs a concrete ratio. A first/last frame fixes the ratio itself.
  const adaptive = hasFrame || (hasRef && model !== "MiniMax-H3-Lite");
  return {
    url: `${BASE}/v2/video_generation`,
    body: {
      model,
      content,
      resolution: req.resolution || cfg.clip?.minimax_resolution || "768P",
      duration: clampDuration(req.duration_s, model),
      ratio: adaptive ? "adaptive" : mapRatio(req.aspect),
    },
  };
}

export function queryUrl(taskId) {
  return `${BASE}/v2/query/video_generation/${encodeURIComponent(taskId)}`;
}

export function pickTask(j, taskId) {
  const id = String(taskId);
  if (Array.isArray(j?.items))
    return j.items.find((t) => String(t?.id) === id) || null;
  if (j?.task && (j.task.id === undefined || String(j.task.id) === id))
    return j.task;
  return null;
}

export function taskState(task) {
  if (!task) return "pending";
  const s = String(task.status || "").toLowerCase();
  if (s === "succeeded" || s === "success") return "done";
  if (["failed", "fail", "cancelled", "expired"].includes(s)) return "failed";
  return "pending";
}

export function taskError(task) {
  const e = task?.error;
  if (!e) return `status ${task?.status}`;
  return [e.code, e.message].filter(Boolean).join(": ") || JSON.stringify(e);
}

export function resultUrl(task) {
  return task?.content?.url || null;
}

export function costUsd(task) {
  const price = PRICE_PER_SECOND[task?.model]?.[task?.resolution];
  const seconds = task?.usage?.total_seconds;
  if (price === undefined || !Number.isFinite(seconds)) return undefined;
  return Math.round(price * seconds * 1e6) / 1e6;
}

async function main() {
  const cfg = config();
  const key = process.env.MINIMAX_API_KEY || cfg.MINIMAX_API_KEY;
  if (!key) fail("no MINIMAX_API_KEY (env or config).", 2);

  const req = JSON.parse(readFileSync(0, "utf8"));
  const isRegenByTask = Boolean(req.source_task_id);
  if (!req.out_path || (!req.brief && !isRegenByTask))
    fail("request needs {brief, out_path} (or {source_task_id, out_path} for regen)", 2);

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
    const t = await r.text();
    let j;
    try {
      j = JSON.parse(t);
    } catch {
      fail(`non-JSON (${r.status}): ${t.slice(0, 200)}`);
    }
    if (!r.ok)
      fail(`${method} ${url} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    const br = j?.base_resp;
    if (br && Number(br.status_code) !== 0)
      fail(`${method} ${url} api error ${br.status_code}: ${br.status_msg}`);
    return j;
  }

  let built;
  try {
    built = buildMinimaxRequest(req, cfg);
  } catch (e) {
    fail(e.message, 2);
  }
  const { url, body, regen } = built;
  const created = await call("POST", url, body);
  const taskId = created.task_id || created.task?.id;
  if (!taskId)
    fail(`no task_id in response: ${JSON.stringify(created).slice(0, 400)}`);

  log(
    `  task_id ${taskId} (billed once created; poll GET ${queryUrl(taskId)} to recover)`,
  );
  const timeoutMin = regen ? 25 : 10;
  const deadline = Date.now() + timeoutMin * 60 * 1000;
  let task = null;
  while (true) {
    await sleep(10000);
    task = pickTask(await call("GET", queryUrl(taskId)), taskId);
    const state = taskState(task);
    if (state === "done") break;
    if (state === "failed") fail(`task ${task.status}: ${taskError(task)}`);
    if (Date.now() >= deadline) fail(`timed out after ${timeoutMin}min`);
    log(`  ...task ${task?.status || "not yet listed"}`);
  }
  const videoUrl = resultUrl(task);
  if (!videoUrl)
    fail(`no result url in task: ${JSON.stringify(task).slice(0, 400)}`);

  const out = resolve(req.out_path);
  mkdirSync(dirname(out), { recursive: true });
  const vr = await fetch(videoUrl, { signal: AbortSignal.timeout(180000) });
  if (!vr.ok) fail(`download ${vr.status} (task_id ${taskId})`);
  const bytes = Buffer.from(await vr.arrayBuffer());
  if (bytes.length < 1000)
    fail(`download too small (${bytes.length} bytes, task_id ${taskId})`);
  writeFileSync(out, bytes);

  let duration_ms = clampDuration(req.duration_s, body.model) * 1000;
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

  const result = { clip_path: out, duration_ms, task_id: String(taskId) };
  const cost_usd = costUsd(task);
  if (cost_usd !== undefined) result.cost_usd = cost_usd;
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();

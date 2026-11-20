#!/usr/bin/env node
// clip adapter — MiniMax H3 via the v2 video generation API. Contract: providers/CONTRACTS.md (clip).
// stdin  {brief, aspect?, duration_s?, ref_frame?, out_path}
// stdout {clip_path, duration_ms, cost_usd?}
// Optional request fields: ref_frame (first frame), ref_images[] + ref_audio[] (reference mode).
// Reference mode cannot be mixed with a first frame; images must have w/h in [0.4, 2.5]; audio must be .wav.
// These gates fail before the API call, so a bad request is never billed.
// Key from env MINIMAX_API_KEY or config MINIMAX_API_KEY (Authorization: Bearer header) — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
const RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const MIN_DURATION = { "MiniMax-H3-Max": 5 };
const PRICE_PER_SECOND = {
  "MiniMax-H3": { "768P": 0.08, "2K": 0.13 },
  "MiniMax-H3-Highspeed": { "768P": 0.06, "480P": 0.04 },
  "MiniMax-H3-Lite": { "768P": 0.04, "480P": 0.025 },
  "MiniMax-H3-Max": { "768P": 0.08, "480P": 0.05 },
};

export const REF_IMAGE_RATIO = [0.4, 2.5];

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
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const k = buf.toString("ascii", 12, 16);
    if (k === "VP8X")
      return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (k === "VP8 ")
      return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (k === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

export function checkRefImage(path) {
  if (!existsSync(resolve(path))) throw new Error(`reference image not found: ${path}`);
  const size = imageSize(readFileSync(resolve(path)));
  if (!size || !size.h) throw new Error(`cannot read reference image size: ${path}`);
  const r = size.w / size.h;
  if (r < REF_IMAGE_RATIO[0] || r > REF_IMAGE_RATIO[1])
    throw new Error(
      `reference image aspect ratio ${r.toFixed(2)} outside [${REF_IMAGE_RATIO.join(", ")}]: ${path}`,
    );
}

export function checkRefAudio(path) {
  if (extname(path).toLowerCase() !== ".wav")
    throw new Error(`reference audio must be .wav: ${path}`);
  if (!existsSync(resolve(path))) throw new Error(`reference audio not found: ${path}`);
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

export function buildMinimaxRequest(req, cfg = {}) {
  const model = cfg.clip?.minimax_model || "MiniMax-H3";
  const content = [{ type: "text", text: req.brief }];
  if (req.ref_frame) {
    if (!existsSync(resolve(req.ref_frame)))
      throw new Error(`ref_frame not found: ${req.ref_frame}`);
    const mime =
      REF_FRAME_MIME[extname(req.ref_frame).toLowerCase()] || "image/png";
    const data = readFileSync(resolve(req.ref_frame)).toString("base64");
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${data}` },
      role: "first_frame",
    });
  }
  const refImages = req.ref_images || [];
  const refAudio = req.ref_audio || [];
  if (req.ref_frame && (refImages.length || refAudio.length))
    throw new Error(
      "H3 refuses a first frame together with reference image/audio: choose one mode",
    );
  for (const p of refImages) {
    checkRefImage(p);
    const mime = REF_FRAME_MIME[extname(p).toLowerCase()] || "image/png";
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${readFileSync(resolve(p)).toString("base64")}` },
      role: "reference_image",
    });
  }
  for (const p of refAudio) {
    checkRefAudio(p);
    content.push({
      type: "audio_url",
      audio_url: { url: `data:audio/wav;base64,${readFileSync(resolve(p)).toString("base64")}` },
      role: "reference_audio",
    });
  }
  // MiniMax-H3-Lite does not support ratio "adaptive" for reference requests (vendor doc,
  // video-generation-v2-create): it needs a concrete ratio. A first frame fixes the ratio itself.
  const hasRef = refImages.length || refAudio.length;
  const adaptive = req.ref_frame || (hasRef && model !== "MiniMax-H3-Lite");
  return {
    url: `${BASE}/v2/video_generation`,
    body: {
      model,
      content,
      resolution: cfg.clip?.minimax_resolution || "768P",
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
  if (task.status === "succeeded") return "done";
  if (["failed", "cancelled"].includes(task.status)) return "failed";
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
  if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

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
  const { url, body } = built;
  const created = await call("POST", url, body);
  const taskId = created.task_id;
  if (!taskId)
    fail(`no task_id in response: ${JSON.stringify(created).slice(0, 400)}`);

  log(
    `  task_id ${taskId} (billed once created; poll GET ${queryUrl(taskId)} to recover)`,
  );
  const deadline = Date.now() + 10 * 60 * 1000;
  let task = null;
  while (true) {
    await sleep(10000);
    task = pickTask(await call("GET", queryUrl(taskId)), taskId);
    const state = taskState(task);
    if (state === "done") break;
    if (state === "failed") fail(`task ${task.status}: ${taskError(task)}`);
    if (Date.now() >= deadline) fail("timed out after 10min");
    log(`  …task ${task?.status || "not yet listed"}`);
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

  const result = { clip_path: out, duration_ms };
  const cost_usd = costUsd(task);
  if (cost_usd !== undefined) result.cost_usd = cost_usd;
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();

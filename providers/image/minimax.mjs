#!/usr/bin/env node
// image adapter: MiniMax H3 Image via /v1/images/generations and /v1/images/edits.
// Contract: providers/CONTRACTS.md (image).
// stdin  {brief, aspect?, refs?, area?, out_path}
// stdout {image_path, refs_used, cost_usd?}
// No refs  -> POST /v1/images/generations (JSON).
// With refs -> POST /v1/images/edits (JSON with base64 data URI images[]).
// Key from env MINIMAX_API_KEY or config MINIMAX_API_KEY (Authorization: Bearer header), never CLI args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, extname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://api.minimax.io/v1/images";
export const MAX_REFS = 14;
const REF_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const RATIOS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"];
// Published token rates ($ / 1M tokens) from platform.minimax.io pricing (read 2026-11-22).
const PRICE_PER_M = {
  "MiniMax-H3-Image": { text_in: 2.3, image_in: 1.5, image_out: 3.8 },
  "MiniMax-H3-Image-Highspeed": { text_in: 2.3, image_in: 3.0, image_out: 7.6 },
};
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("minimax image: " + m);
  process.exit(c);
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

export function checkPlaceholders(prompt) {
  if (typeof prompt !== "string") return;
  const matches = prompt.match(/\[[A-Z][A-Z0-9_]{2,}\]/g);
  if (!matches) return;
  const left = [...new Set(matches)].sort();
  throw new Error(
    `unfilled placeholder(s) ${left.join(", ")}: fill them before generating`,
  );
}

export function mapAspect(aspect) {
  if (!aspect) return "16:9";
  if (RATIOS.includes(aspect)) return aspect;
  log(`minimax image: aspect ${aspect} is unsupported; generating 16:9.`);
  return "16:9";
}

// Reads every reference from disk. Throws on a missing or unsupported file so a
// reference is never silently dropped.
export function loadRefs(refs) {
  const list = (refs || []).filter(Boolean);
  if (list.length > MAX_REFS)
    throw new Error(
      `${list.length} refs given; the provider accepts ${MAX_REFS}`,
    );
  return list.map((p) => {
    const abs = resolve(p);
    const mime = REF_MIME[extname(abs).toLowerCase()];
    if (!mime) throw new Error(`ref ${p}: use .png, .jpg or .webp`);
    if (!existsSync(abs)) throw new Error(`ref ${p}: file not found`);
    const b64 = readFileSync(abs).toString("base64");
    return { image_url: `data:${mime};base64,${b64}` };
  });
}

export function buildMinimaxImageRequest(req, cfg = {}) {
  checkPlaceholders(req.brief);
  const model = cfg.image?.minimax_model || "MiniMax-H3-Image";
  const area = req.area || cfg.image?.minimax_area || "2K";
  const aspect_ratio = mapAspect(req.aspect);
  const refs = loadRefs(req.refs);
  const body = {
    model,
    prompt: req.brief,
    aspect_ratio,
    area,
    response_format: "url",
    n: 1,
  };
  if (refs.length) {
    body.images = refs;
    return { url: `${BASE}/edits`, body, refs_used: refs.length };
  }
  return { url: `${BASE}/generations`, body, refs_used: 0 };
}

export function extractImage(j) {
  const first = Array.isArray(j?.data) ? j.data[0] : null;
  if (!first || typeof first !== "object") return null;
  if (first.url) return { url: first.url };
  if (first.b64_json) return { b64_json: first.b64_json };
  return null;
}

export function imageCostUsd(usage, model = "MiniMax-H3-Image") {
  const rates = PRICE_PER_M[model];
  if (!rates || !usage || typeof usage !== "object") return undefined;
  const inDetails = usage.input_tokens_details || {};
  const outDetails = usage.output_tokens_details || {};
  const textIn = Number.isFinite(inDetails.text_tokens)
    ? inDetails.text_tokens
    : Number.isFinite(usage.input_tokens)
      ? usage.input_tokens
      : 0;
  const imageIn = Number.isFinite(inDetails.image_tokens)
    ? inDetails.image_tokens
    : 0;
  const imageOut = Number.isFinite(outDetails.image_tokens)
    ? outDetails.image_tokens
    : Number.isFinite(usage.output_tokens)
      ? usage.output_tokens
      : null;
  if (imageOut === null) return undefined;
  const usd =
    (textIn * rates.text_in +
      imageIn * rates.image_in +
      imageOut * rates.image_out) /
    1e6;
  return Math.round(usd * 1e6) / 1e6;
}

async function main() {
  const cfg = config();
  const key = process.env.MINIMAX_API_KEY || cfg.MINIMAX_API_KEY;
  if (!key) fail("no MINIMAX_API_KEY (env or config).", 2);

  const req = JSON.parse(readFileSync(0, "utf8"));
  if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

  let built;
  try {
    built = buildMinimaxImageRequest(req, cfg);
  } catch (e) {
    fail(e.message, 2);
  }
  if (built.refs_used) log(`sending ${built.refs_used} reference image(s)`);

  const r = await fetch(built.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(built.body),
    signal: AbortSignal.timeout(180000),
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    fail(`non-JSON (${r.status}): ${t.slice(0, 200)}`);
  }
  if (!r.ok) fail(`${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const br = j?.base_resp;
  if (br && Number(br.status_code) !== 0)
    fail(`api error ${br.status_code}: ${br.status_msg}`);

  const img = extractImage(j);
  if (!img) fail(`no image in response: ${JSON.stringify(j).slice(0, 300)}`);

  let bytes;
  if (img.url) {
    const ir = await fetch(img.url, { signal: AbortSignal.timeout(180000) });
    if (!ir.ok) fail(`download ${ir.status}`);
    bytes = Buffer.from(await ir.arrayBuffer());
    if (bytes.length < 1000) fail(`download too small (${bytes.length} bytes)`);
  } else {
    bytes = Buffer.from(img.b64_json, "base64");
  }

  const out = resolve(req.out_path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);

  const res = { image_path: out, refs_used: built.refs_used };
  const cost_usd = imageCostUsd(j.usage, built.body.model);
  if (cost_usd !== undefined) res.cost_usd = cost_usd;
  process.stdout.write(JSON.stringify(res) + "\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();

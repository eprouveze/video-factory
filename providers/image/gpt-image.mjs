#!/usr/bin/env node
// image adapter — OpenAI gpt-image. Contract: providers/CONTRACTS.md (image).
// stdin  {brief, aspect?, refs?, out_path}
// stdout {image_path, refs_used}
// No refs  → POST /v1/images/generations (JSON).
// With refs → POST /v1/images/edits (multipart, one image[] part per reference).
// Key from env OPENAI_API_KEY or config image.openai_api_key — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { sniffImageMime } from "./lib/format.mjs";
import { basename, dirname, extname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://api.openai.com/v1/images";
export const MAX_REFS = 16; // OpenAI: up to 16 input images for GPT image models
const REF_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
// OpenAI's image endpoints accept exactly these three shapes. There is NO native 16:9, so a
// 16:9 request is served at 3:2 and the caller must crop. Making that explicit (rather than
// silently letterboxing) is what stopped the 2026-11-23 bake-off from being misleading: the
// approved composition is not the delivered one until the crop is chosen deliberately.
const SIZES = { "16:9": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024" };
export const NATIVE_ASPECTS = ["3:2", "2:3", "1:1"];
const SIZE_ASPECT = { "1536x1024": "3:2", "1024x1536": "2:3", "1024x1024": "1:1" };
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("gpt-image: " + m);
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

// Reads every reference from disk. Throws on a missing or unsupported file: a reference
// that silently does not reach the provider is worse than a failed call.
export function loadRefs(refs) {
  const list = (refs || []).filter(Boolean);
  if (list.length > MAX_REFS)
    throw new Error(
      `${list.length} refs given; the provider accepts ${MAX_REFS}`,
    );
  return list.map((p) => {
    const path = resolve(p);
    const extMime = REF_MIME[extname(path).toLowerCase()];
    if (!extMime) throw new Error(`ref ${p}: use .png, .jpg or .webp`);
    if (!existsSync(path)) throw new Error(`ref ${p}: file not found`);
    // The extension decides what is allowed; the bytes decide what it actually is.
    const bytes = readFileSync(path);
    const mime = sniffImageMime(bytes) || extMime;
    return { name: basename(path), mime, bytes };
  });
}

export function buildImageRequest(req, cfg = {}) {
  const model = cfg.image?.openai_model || "gpt-image-2.6-sunburst";
  const size = SIZES[req.aspect] || "1536x1024";
  const refs = loadRefs(req.refs);
  if (!refs.length)
    return {
      url: `${BASE}/generations`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: req.brief, size, n: 1 }),
      refs_used: 0,
      size,
    };
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", req.brief);
  form.append("size", size);
  form.append("n", "1");
  for (const r of refs)
    form.append("image[]", new Blob([r.bytes], { type: r.mime }), r.name);
  // no Content-Type header: fetch sets the multipart boundary itself
  return {
    url: `${BASE}/edits`,
    headers: {},
    body: form,
    refs_used: refs.length,
    size,
  };
}

async function main() {
  const cfg = config();
  const key = process.env.OPENAI_API_KEY || cfg.image?.openai_api_key;
  if (!key) fail("no OPENAI_API_KEY (env or config image.openai_api_key).", 2);

  const req = JSON.parse(readFileSync(0, "utf8"));
  if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

  let built;
  try {
    built = buildImageRequest(req, cfg);
  } catch (e) {
    fail(e.message, 2);
  }
  if (built.refs_used) log(`sending ${built.refs_used} reference image(s)`);
  const requestedAspect = req.aspect || "16:9";
  const actualAspect = SIZE_ASPECT[built.size] || null;
  if (actualAspect && actualAspect !== requestedAspect)
    log(
      `WARNING: ${requestedAspect} requested but OpenAI has no such shape; producing ` +
        `${actualAspect} (${built.size}). This still must be cropped downstream.`,
    );

  const r = await fetch(built.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, ...built.headers },
    body: built.body,
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    fail(`non-JSON (${r.status}): ${t.slice(0, 200)}`);
  }
  if (!r.ok) fail(`${r.status}: ${JSON.stringify(j).slice(0, 300)}`);

  const b64 = j.data?.[0]?.b64_json;
  if (!b64) fail(`no image in response: ${JSON.stringify(j).slice(0, 200)}`);

  const out = resolve(req.out_path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(b64, "base64"));

  const res = { image_path: out, refs_used: built.refs_used };
  // Report the aspect we actually produced. A caller asking for 16:9 gets 3:2 plus an
  // explicit crop flag instead of a surprise in the compositor.
  res.aspect_requested = requestedAspect;
  res.aspect_actual = actualAspect;
  res.crop_required = Boolean(actualAspect && actualAspect !== requestedAspect);
  const u = j.usage;
  if (u && Number.isFinite(u.output_tokens)) {
    const d = u.input_tokens_details ?? {};
    res.cost_usd = +(
      ((d.text_tokens ?? u.input_tokens ?? 0) * 5 +
        (d.image_tokens ?? 0) * 8 +
        u.output_tokens * 30) /
      1e6
    ).toFixed(4);
    log(`usage: ${JSON.stringify(u)}`);
  }
  process.stdout.write(JSON.stringify(res) + "\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();

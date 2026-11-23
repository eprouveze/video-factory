#!/usr/bin/env node
// image adapter — Gemini native image generation via Interactions API. Contract: providers/CONTRACTS.md (image).
// stdin  {brief, aspect?, refs?, seed?, out_path}
// stdout {image_path, refs_used}
// refs are sent as image content blocks after the text, as the Interactions API documents.
// Key from env GEMINI_API_KEY or config GEMINI_API_KEY (x-goog-api-key) — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { sniffImageMime, pathMatchingMime } from "./lib/format.mjs";
import { dirname, extname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const MAX_REFS = 14; // Google: up to 14 reference images
const REF_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("gemini image: " + m);
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
    // The extension decides what is *allowed*; the bytes decide what it actually is. A .png
    // holding JPEG data (which this very adapter produced before 2026-11-23) must not be
    // sent as image/png.
    const bytes = readFileSync(path);
    const mime = sniffImageMime(bytes) || extMime;
    return {
      type: "image",
      mime_type: mime,
      data: bytes.toString("base64"),
    };
  });
}

export function buildImageRequest(req, cfg = {}) {
  const refs = loadRefs(req.refs);
  return {
    url: BASE,
    refs_used: refs.length,
    body: {
      model:
        cfg.image?.model ||
        process.env.VF_IMAGE_MODEL ||
        "gemini-3.1-flash-lite-image",
      input: refs.length
        ? [{ type: "text", text: req.brief }, ...refs]
        : req.brief,
      response_format: {
        type: "image",
        aspect_ratio: req.aspect || "16:9",
        // Nano Banana Pro renders at 2K; the lite tier is 1K. Callers can raise it per
        // machine via config (`image.image_size`) or per adapter via VF_IMAGE_SIZE.
        image_size: cfg.image?.image_size || process.env.VF_IMAGE_SIZE || "1K",
      },
    },
  };
}

export function findImage(j) {
  for (const step of j.steps || []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content || []) {
      if (block.type === "image" && block.data) return block.data;
    }
  }
  return null;
}

export async function main() {
  const cfg = config();
  const key = process.env.GEMINI_API_KEY || cfg.GEMINI_API_KEY;
  if (!key) fail("no GEMINI_API_KEY (env or config).", 2);

  const req = JSON.parse(readFileSync(0, "utf8"));
  if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

  let built;
  try {
    built = buildImageRequest(req, cfg);
  } catch (e) {
    fail(e.message, 2);
  }
  const { url, body, refs_used } = built;
  if (refs_used) log(`sending ${refs_used} reference image(s)`);
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    fail(`non-JSON (${r.status}): ${t.slice(0, 200)}`);
  }
  if (!r.ok)
    fail(`interactions ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);

  const data = findImage(j);
  if (!data) fail(`no image in response: ${JSON.stringify(j).slice(0, 300)}`);

  // Gemini returns whatever the model emits: flash tiers give PNG, gemini-3-pro-image gives
  // JPEG. Writing those bytes to a caller-supplied `.png` path produces a file that lies
  // about itself, so the path is corrected to match the bytes and the truth is reported.
  const bytes = Buffer.from(data, "base64");
  const mime = sniffImageMime(bytes);
  const requested = resolve(req.out_path);
  const out = mime ? pathMatchingMime(requested, mime) : requested;
  if (out !== requested)
    log(`provider returned ${mime}; writing ${out} instead of ${req.out_path}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  process.stdout.write(
    JSON.stringify({ image_path: out, refs_used, mime_type: mime || null }) +
      "\n",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();

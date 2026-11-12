#!/usr/bin/env node
// image adapter — Gemini native image generation via Interactions API. Contract: providers/CONTRACTS.md (image).
// stdin  {brief, aspect?, seed?, out_path}
// stdout {image_path}
// Key from env GEMINI_API_KEY or config GEMINI_API_KEY (x-goog-api-key) — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://generativelanguage.googleapis.com/v1beta/interactions";
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

export function buildImageRequest(req, cfg = {}) {
  return {
    url: BASE,
    body: {
      model: cfg.image?.model || "gemini-3.1-flash-lite-image",
      input: req.brief,
      response_format: {
        type: "image",
        aspect_ratio: req.aspect || "16:9",
        image_size: "1K",
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

async function main() {
  const cfg = config();
  const key = process.env.GEMINI_API_KEY || cfg.GEMINI_API_KEY;
  if (!key) fail("no GEMINI_API_KEY (env or config).", 2);

  const req = JSON.parse(readFileSync(0, "utf8"));
  if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

  const { url, body } = buildImageRequest(req, cfg);
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

  const out = resolve(req.out_path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(data, "base64"));
  process.stdout.write(JSON.stringify({ image_path: out }) + "\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();

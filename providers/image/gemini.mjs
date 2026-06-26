#!/usr/bin/env node
// image adapter — Imagen via Gemini API. Contract: providers/CONTRACTS.md (image).
// stdin  {brief, aspect?, seed?, out_path}
// stdout {image_path}
// Key from env GEMINI_API_KEY or config GEMINI_API_KEY (x-goog-api-key) — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("imagen: " + m);
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

const cfg = config();
const key = process.env.GEMINI_API_KEY || cfg.GEMINI_API_KEY;
if (!key) fail("no GEMINI_API_KEY (env or config).", 2);

const req = JSON.parse(readFileSync(0, "utf8"));
if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const model = cfg.image?.model || "imagen-4.0-fast-generate-001";
const aspect = req.aspect || "16:9";
const body = {
  instances: [{ prompt: req.brief }],
  parameters: { sampleCount: 1, aspectRatio: aspect },
};

const r = await fetch(`${BASE}/models/${model}:predict`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": key },
  body: JSON.stringify(body),
});
const t = await r.text();
let j;
try {
  j = JSON.parse(t);
} catch {
  fail(`non-JSON (${r.status}): ${t.slice(0, 200)}`);
}
if (!r.ok) fail(`predict ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);

// find the image bytes (predictions[].bytesBase64Encoded)
const pred = (j.predictions || []).find((p) => p.bytesBase64Encoded);
if (!pred) fail(`no image in response: ${JSON.stringify(j).slice(0, 300)}`);

const out = resolve(req.out_path);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(pred.bytesBase64Encoded, "base64"));

process.stdout.write(JSON.stringify({ image_path: out }) + "\n");

#!/usr/bin/env node
// image adapter — OpenAI gpt-image. Contract: providers/CONTRACTS.md (image).
// stdin  {brief, aspect?, out_path}
// stdout {image_path}
// Key from env OPENAI_API_KEY or config image.openai_api_key — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

const cfg = config();
const key = process.env.OPENAI_API_KEY || cfg.image?.openai_api_key;
if (!key) fail("no OPENAI_API_KEY (env or config image.openai_api_key).", 2);

const req = JSON.parse(readFileSync(0, "utf8"));
if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

const model = cfg.image?.openai_model || "gpt-image-2";
const size =
  { "16:9": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024" }[
    req.aspect
  ] || "1536x1024";

const r = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ model, prompt: req.brief, size, n: 1 }),
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

process.stdout.write(JSON.stringify({ image_path: out }) + "\n");

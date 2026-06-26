#!/usr/bin/env node
// sfx adapter — ElevenLabs Sound Effects. Contract: providers/CONTRACTS.md (sfx).
// stdin  {brief, duration_s?, out_path}
// stdout {audio_path}
// Key from env ELEVENLABS_API_KEY or config — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("elevenlabs sfx: " + m);
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
const key = process.env.ELEVENLABS_API_KEY || cfg.ELEVENLABS_API_KEY;
if (!key) fail("no ELEVENLABS_API_KEY (env or config).", 2);

const req = JSON.parse(readFileSync(0, "utf8"));
if (!req.brief || !req.out_path) fail("request needs {brief, out_path}", 2);

const body = { text: req.brief };
if (req.duration_s)
  body.duration_seconds = Math.min(Math.max(req.duration_s, 0.5), 22);

const r = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!r.ok) {
  const t = await r.text().catch(() => "");
  fail(`API ${r.status}: ${t.slice(0, 300)}`);
}

const out = resolve(req.out_path);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await r.arrayBuffer()));

process.stdout.write(JSON.stringify({ audio_path: out }) + "\n");

#!/usr/bin/env node
// music adapter — ElevenLabs Music. Contract: providers/CONTRACTS.md (music).
// stdin  {brief, duration_ms?, out_path}
// stdout {audio_path, duration_ms}
// Key from env ELEVENLABS_API_KEY or config — never args.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("elevenlabs music: " + m);
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

const lenMs = Math.min(Math.max(req.duration_ms || 30000, 10000), 300000); // clamp 10s–5min

const r = await fetch("https://api.elevenlabs.io/v1/music", {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: req.brief, music_length_ms: lenMs }),
});
if (!r.ok) {
  const t = await r.text().catch(() => "");
  fail(`API ${r.status}: ${t.slice(0, 300)}`);
}

// response may be raw audio bytes or JSON with audio_base64 — handle both
const ct = r.headers.get("content-type") || "";
const out = resolve(req.out_path);
mkdirSync(dirname(out), { recursive: true });
if (ct.includes("application/json")) {
  const j = await r.json();
  const b64 = j.audio_base64 || j.audio;
  if (!b64)
    fail(`JSON response without audio: ${JSON.stringify(j).slice(0, 200)}`);
  writeFileSync(out, Buffer.from(b64, "base64"));
} else {
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

let duration_ms = lenMs;
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
  duration_ms = Math.round(parseFloat(d) * 1000);
} catch {}

process.stdout.write(JSON.stringify({ audio_path: out, duration_ms }) + "\n");

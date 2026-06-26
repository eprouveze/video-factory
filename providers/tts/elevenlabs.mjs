#!/usr/bin/env node
// tts adapter — ElevenLabs (with-timestamps). Contract: providers/CONTRACTS.md (tts).
// stdin  {text, voice?, tone?, prev_text?, next_text?, out_path}
// stdout {audio_path, duration_ms, word_timings:[{word,start_ms,end_ms}]}
// Secrets from env ELEVENLABS_API_KEY or .video-factory/config.json — never from args/JSON.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (msg, code = 1) => {
  log("elevenlabs tts: " + msg);
  process.exit(code);
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
const apiKey = process.env.ELEVENLABS_API_KEY || cfg.ELEVENLABS_API_KEY;
if (!apiKey)
  fail(
    "no ELEVENLABS_API_KEY (env or .video-factory/config.json). Run /video-factory:setup.",
    2,
  );

const req = JSON.parse(readFileSync(0, "utf8"));
if (!req.text || !req.out_path) fail("request needs {text, out_path}", 2);

const voice = req.voice || cfg.tts?.default_voice || "21m00Tcm4TlvDq8ikWAM"; // Rachel fallback
const model = cfg.tts?.model || "eleven_flash_v2_5";

// tone → delivery (light mapping)
const tone = (req.tone || "").toLowerCase();
const stability = /calm|authoritative|narrat|serious/.test(tone)
  ? 0.5
  : /energetic|excited|hype|punchy/.test(tone)
    ? 0.3
    : 0.4;
const voice_settings = {
  stability,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
};

const body = { text: req.text, model_id: model, voice_settings };
if (req.prev_text) body.previous_text = req.prev_text;
if (req.next_text) body.next_text = req.next_text;

const out = resolve(req.out_path);
mkdirSync(dirname(out), { recursive: true });

const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`;
const resp = await fetch(url, {
  method: "POST",
  headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!resp.ok) {
  const t = await resp.text().catch(() => "");
  fail(`API ${resp.status}: ${t.slice(0, 300)}`, 1);
}
const data = await resp.json();
if (!data.audio_base64) fail("no audio_base64 in API response", 1);
writeFileSync(out, Buffer.from(data.audio_base64, "base64"));

// char-level timings → word timings
const al = data.alignment || data.normalized_alignment || {};
const chars = al.characters || [];
const starts = al.character_start_times_seconds || [];
const ends = al.character_end_times_seconds || [];
const word_timings = [];
let cur = "",
  curStart = null,
  curEnd = null;
for (let i = 0; i < chars.length; i++) {
  if (/\s/.test(chars[i])) {
    if (cur) {
      word_timings.push({
        word: cur,
        start_ms: Math.round((curStart ?? 0) * 1000),
        end_ms: Math.round((curEnd ?? 0) * 1000),
      });
      cur = "";
      curStart = null;
    }
  } else {
    if (curStart === null) curStart = starts[i] ?? 0;
    curEnd = ends[i] ?? curStart;
    cur += chars[i];
  }
}
if (cur)
  word_timings.push({
    word: cur,
    start_ms: Math.round((curStart ?? 0) * 1000),
    end_ms: Math.round((curEnd ?? 0) * 1000),
  });

// duration measured via ffprobe (not estimated)
let duration_ms = 0;
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
} catch {
  duration_ms = ends.length ? Math.round(ends[ends.length - 1] * 1000) : 0;
}

process.stdout.write(
  JSON.stringify({ audio_path: out, duration_ms, word_timings }) + "\n",
);

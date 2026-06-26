#!/usr/bin/env node
// extract-voice — pull clean spoken QUOTES out of a real recording, for use as a scene's
// real-voice voiceover (instead of TTS). This is how you put a speaker's ACTUAL voice on the
// apex lines of a recap: forced-alignment via Whisper word timestamps, then a normalized cut.
//
// usage:
//   node scripts/extract-voice.mjs <project-dir> '<phrase 1>' '<phrase 2>' ...
//   node scripts/extract-voice.mjs <project-dir> --audio assets/source/talk.m4a --json phrases.json
//
// Expects a recording at <project-dir>/assets/source/session-audio.* (or --audio <path>).
// For each phrase it writes:
//   <project-dir>/audio/voice-<slug>.mp3              (loudnorm'd, faded, mono 44.1k)
//   and prints a manifest-ready scene fragment: { _audio, word_timings, duration_ms }
// Caches the transcript at <project-dir>/assets/source/stt.json (reused on re-runs).
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const slug = (s) => norm(s).split(" ").slice(0, 4).join("-");

const args = process.argv.slice(2);
const projDir = resolve(args.shift() || ".");
let audioArg,
  phrases = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--audio") audioArg = args[++i];
  else if (args[i] === "--json")
    phrases = JSON.parse(readFileSync(args[++i], "utf8"));
  else phrases.push(args[i]);
}
if (!phrases.length) {
  log("no phrases given");
  process.exit(2);
}

// locate the recording
let audio = audioArg ? resolve(projDir, audioArg) : null;
if (!audio) {
  const srcDir = join(projDir, "assets", "source");
  const cand = existsSync(srcDir)
    ? readdirSync(srcDir).find((f) =>
        /^session-audio\.|\.(m4a|mp3|wav|aac)$/i.test(f),
      )
    : null;
  if (cand) audio = join(srcDir, cand);
}
if (!audio || !existsSync(audio)) {
  log("recording not found (pass --audio <path>)");
  process.exit(2);
}

// transcribe (cache)
const sttPath = join(projDir, "assets", "source", "stt.json");
if (!existsSync(sttPath)) {
  log("transcribing with whisper (word timestamps)…");
  const r = execFileSync(
    "node",
    [join(ROOT, "providers/stt/openai-whisper.mjs")],
    {
      input: JSON.stringify({ audio_path: audio, out_path: sttPath }),
      encoding: "utf8",
    },
  );
  if (!existsSync(sttPath)) {
    log("whisper produced no transcript: " + r.slice(0, 200));
    process.exit(1);
  }
}
const stt = JSON.parse(readFileSync(sttPath, "utf8"));
const W = (stt.words || []).map((w) => ({
  n: norm(w.word),
  s: w.start,
  e: w.end,
  raw: w.word.trim(),
}));

function findSeq(phrase) {
  const toks = norm(phrase).split(" ").filter(Boolean);
  for (let i = 0; i <= W.length - toks.length; i++) {
    let ok = true;
    for (let k = 0; k < toks.length; k++)
      if (W[i + k].n !== toks[k]) {
        ok = false;
        break;
      }
    if (ok) return W.slice(i, i + toks.length);
  }
  return null;
}

mkdirSync(join(projDir, "audio"), { recursive: true });
const LEAD = 0.12,
  TAIL = 0.3;
const results = {};
for (const phrase of phrases) {
  const seq = findSeq(phrase);
  if (!seq) {
    log(`✗ not found verbatim: "${phrase}"`);
    continue;
  }
  const start = seq[0].s,
    end = seq[seq.length - 1].e;
  const clipStart = Math.max(0, start - LEAD);
  const dur = end - clipStart + TAIL;
  const outRel = `audio/voice-${slug(phrase)}.mp3`;
  const outAbs = join(projDir, outRel);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    clipStart.toFixed(3),
    "-t",
    dur.toFixed(3),
    "-i",
    audio,
    "-af",
    `loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.06,afade=t=out:st=${(dur - 0.18).toFixed(3)}:d=0.18`,
    "-ar",
    "44100",
    "-ac",
    "1",
    outAbs,
  ]);
  const durMs = Math.round(
    parseFloat(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        outAbs,
      ]).toString(),
    ) * 1000,
  );
  const word_timings = seq.map((w) => ({
    word: w.raw,
    start_ms: Math.max(0, Math.round((w.s - clipStart) * 1000)),
    end_ms: Math.round((w.e - clipStart) * 1000),
  }));
  results[slug(phrase)] = { _audio: outRel, duration_ms: durMs, word_timings };
  log(
    `✓ "${phrase}"  →  ${outRel}  (${durMs}ms, ${word_timings.length} words)`,
  );
}
process.stdout.write(JSON.stringify(results, null, 2) + "\n");

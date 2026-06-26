#!/usr/bin/env node
// Reference producer — what /video-factory:video does, scripted.
// For each scene: TTS-first (audio + word timings), write the MEASURED duration back into the
// manifest (so the compositor times to real audio), enforce the WPM quality gate.
// usage: node scripts/produce.mjs <project-dir>   (expects <project-dir>/manifest.json)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projDir = resolve(process.argv[2] || ".");
const manifestPath = join(projDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tone = manifest.brand?.tone || "";
const TTS = join(ROOT, "providers/tts/elevenlabs.mjs");

mkdirSync(join(projDir, "audio"), { recursive: true });

const tts = (req) =>
  JSON.parse(
    execFileSync("node", [TTS], {
      input: JSON.stringify(req),
      encoding: "utf8",
    }),
  );

const scenes = manifest.scenes || [];
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  const r = tts({
    text: s.tts_script,
    tone,
    prev_text: scenes[i - 1]?.tts_script,
    next_text: scenes[i + 1]?.tts_script,
    out_path: join(projDir, "audio", `${s.id}.mp3`),
  });
  s._audio = `audio/${s.id}.mp3`; // relative to projDir; compositor stages it into public/
  s.word_timings = r.word_timings;
  s.duration_ms = r.duration_ms; // TTS-first write-back

  // quality gate: words-per-minute
  const words = (s.tts_script.match(/\S+/g) || []).length;
  const wpm = words / (r.duration_ms / 60000);
  const [lo, hi] = s.quality_gate?.speaking_rate_wpm || [120, 180];
  const flag =
    wpm < lo || wpm > hi
      ? `  ⚠️ WPM ${wpm.toFixed(0)} outside [${lo},${hi}]`
      : "";
  process.stderr.write(
    `  ${s.id}: ${r.duration_ms}ms · ${r.word_timings.length} words · ${wpm.toFixed(0)} wpm${flag}\n`,
  );
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(`produced ${scenes.length} scenes → ${manifestPath}\n`);

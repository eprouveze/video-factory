#!/usr/bin/env node
// Put every cut on a beat of the music bed. Narration is never shortened or re-timed: each
// scene only HOLDS a little longer after its last word, so that the cut to the next scene
// lands on the next beat (a downbeat when one is close enough).
//
// usage: node scripts/snap-grid.mjs <project-dir | manifest.json> [--beats beats.json] [--max-hold-ms 900]
// Reads the bed from manifest.music when --beats is not given. Writes manifest.grid and the
// new scene durations (the measured narration length is kept in scene.audio_ms).
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beatMap } from "./beat-map.mjs";

export function snapToGrid(
  manifest,
  beats,
  { maxHoldMs = 900, minTailMs = 60 } = {},
) {
  const fps = manifest.fps ?? 30;
  const scenes = manifest.scenes ?? [];
  if (!beats?.reliable || !beats.beats_ms?.length) {
    manifest.grid = {
      snapped: false,
      reason: "no reliable pulse in the bed",
      bpm: beats?.bpm ?? null,
      confidence: beats?.confidence ?? 0,
    };
    return { snapped: 0, held_ms: 0, skipped: scenes.length };
  }
  const down = new Set(beats.downbeats_ms);
  const frameOf = (ms) => Math.round((ms / 1000) * fps);
  let accF = 0;
  let snapped = 0;
  let held = 0;
  let skipped = 0;
  scenes.forEach((s, i) => {
    const natural =
      s.audio_ms ??
      s.duration_ms ??
      Math.round((s.duration_estimate_s ?? 4) * 1000);
    if (s.duration_ms != null && s.audio_ms == null) s.audio_ms = s.duration_ms;
    const startMs = (accF / fps) * 1000;
    const endMs = startMs + natural;
    let durF = Math.max(1, Math.ceil((natural / 1000) * fps - 1e-6));
    if (i < scenes.length - 1) {
      const window = beats.beats_ms.filter(
        (t) => t >= endMs + minTailMs && t <= endMs + maxHoldMs,
      );
      const target = window.find((t) => down.has(t)) ?? window[0];
      if (target != null) {
        durF = Math.max(1, frameOf(target) - accF);
        snapped++;
        held += Math.max(0, (durF / fps) * 1000 - natural);
      } else skipped++;
    }
    s.duration_ms = Math.round((durF / fps) * 1000);
    accF += durF;
  });
  manifest.grid = {
    snapped: skipped === 0,
    bpm: beats.bpm,
    confidence: beats.confidence,
    beats_ms: beats.beats_ms,
    downbeats_ms: beats.downbeats_ms,
    ...(skipped
      ? { reason: `${skipped} cut(s) had no beat within ${maxHoldMs} ms` }
      : {}),
  };
  return { snapped, held_ms: Math.round(held), skipped };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const a = process.argv.slice(2);
  const opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  let p = resolve(
    a.find(
      (x, i) => !x.startsWith("--") && !(a[i - 1] ?? "").startsWith("--"),
    ) || ".",
  );
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "manifest.json");
  const manifest = JSON.parse(readFileSync(p, "utf8"));
  const beatsPath = opt("--beats", null);
  let beats;
  if (beatsPath) beats = JSON.parse(readFileSync(beatsPath, "utf8"));
  else if (manifest.music) beats = beatMap(join(dirname(p), manifest.music));
  else {
    process.stderr.write(
      "snap-grid: no --beats file and no manifest.music to measure\n",
    );
    process.exit(2);
  }
  const r = snapToGrid(manifest, beats, {
    maxHoldMs: +opt("--max-hold-ms", 900),
  });
  writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(
    manifest.grid.snapped
      ? `snapped ${r.snapped} cuts to ${beats.bpm} BPM · ${r.held_ms} ms of holds added\n`
      : `not snapped: ${manifest.grid.reason}\n`,
  );
}

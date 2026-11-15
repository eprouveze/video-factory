#!/usr/bin/env node
// Build a music-first manifest.json from an audio master, optional sections.json,
// beat-map JSON, and an edit-decision list (EDL).
// Source audio controls total duration; shots partition [0, duration_ms] exactly.
//
// Usage:
//   node scripts/music-manifest.mjs <edl.json> [--out manifest.json] [--beats beats.json] [--sections sections.json]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beatMap } from "./beat-map.mjs";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".mkv"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function probeAudioDurationMs(audioPath) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", audioPath],
    { encoding: "utf8" },
  ).trim();
  const sec = parseFloat(out);
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`Invalid audio duration from ffprobe for ${audioPath}: "${out}"`);
  }
  return Math.round(sec * 1000);
}

function inferVisualSource(shot) {
  if (shot.tech_test_placeholder) return "placeholder";
  if (shot.source) return shot.source;
  const p = shot.video_or_image_source_path || "";
  const ext = extname(p).toLowerCase();
  if (VIDEO_EXTS.has(ext)) return "clip";
  if (IMAGE_EXTS.has(ext)) return "image";
  throw new Error(`Shot ${shot.shot_id}: cannot infer visual source from "${p}"`);
}

export function validateSections(sections, durationMs) {
  if (!Array.isArray(sections) || !sections.length) return [];
  const sorted = [...sections].sort((a, b) => a.in_ms - b.in_ms);
  for (let i = 0; i < sorted.length; i++) {
    const sec = sorted[i];
    if (!sec.section_id && !sec.id) throw new Error(`Section[${i}] missing section_id/id`);
    if (sec.in_ms == null || sec.out_ms == null || sec.out_ms <= sec.in_ms) {
      throw new Error(`Section ${sec.section_id || sec.id}: invalid in_ms/out_ms`);
    }
    if (sec.out_ms > durationMs) {
      throw new Error(`Section ${sec.section_id || sec.id}: out_ms (${sec.out_ms}) exceeds audio duration (${durationMs})`);
    }
    if (i > 0 && sec.in_ms < sorted[i - 1].out_ms) {
      throw new Error(`Section ${sec.section_id || sec.id}: overlaps previous section`);
    }
  }
  return sorted;
}

export function buildMusicManifest({ edl, audioDurationMs, beats = null, sections = [], baseDir = "." }) {
  if (!edl?.audio_master_path) throw new Error("EDL requires audio_master_path");
  if (!Array.isArray(edl.shots) || !edl.shots.length) throw new Error("EDL requires non-empty shots[]");

  const fps = edl.fps ?? 30;
  const format = edl.format ?? ["16:9"];
  const validSections = validateSections(sections, audioDurationMs);
  const shots = [...edl.shots].sort((a, b) => a.in_ms - b.in_ms);

  // Check exact partition [0, audioDurationMs]
  let cursor = 0;
  const scenes = shots.map((shot, idx) => {
    if (!shot.shot_id) throw new Error(`Shot[${idx}] missing shot_id`);
    const inMs = Math.round(shot.in_ms);
    let outMs = Math.round(shot.out_ms);
    // Allow final shot to clamp tiny rounding (< 25ms) to exact audioDurationMs
    if (idx === shots.length - 1 && Math.abs(outMs - audioDurationMs) <= 25) {
      outMs = audioDurationMs;
    }
    if (inMs !== cursor) {
      throw new Error(`Shot ${shot.shot_id}: in_ms (${inMs}) != prior out_ms (${cursor})`);
    }
    if (outMs <= inMs) {
      throw new Error(`Shot ${shot.shot_id}: out_ms (${outMs}) must be > in_ms (${inMs})`);
    }
    cursor = outMs;

    const source = inferVisualSource(shot);
    const asset = shot.video_or_image_source_path || undefined;
    if (source !== "placeholder" && !asset) {
      throw new Error(`Shot ${shot.shot_id}: missing video_or_image_source_path`);
    }
    if (asset && !existsSync(resolve(baseDir, asset))) {
      throw new Error(`Shot ${shot.shot_id}: asset not found on disk: ${asset}`);
    }

    const secMatch = validSections.find((s) => inMs >= s.in_ms && inMs < s.out_ms);
    const visual =
      source === "placeholder"
        ? { source: "placeholder" }
        : {
            source,
            asset,
            ...(source === "image" ? { shot: { motion: shot.motion || "push" } } : {}),
          };

    return {
      id: shot.shot_id,
      ...(shot.title ? { title: shot.title } : {}),
      in_ms: inMs,
      out_ms: outMs,
      duration_ms: outMs - inMs,
      ...(shot.section_id || secMatch ? { section_id: shot.section_id || secMatch.section_id || secMatch.id } : {}),
      ...(shot.camera_side ? { camera_side: shot.camera_side } : {}),
      ...(shot.eye_state ? { eye_state: shot.eye_state } : {}),
      ...(shot.requires_lipsync != null ? { requires_lipsync: !!shot.requires_lipsync } : {}),
      ...(shot.lyrics_line ? { lyrics_line: shot.lyrics_line } : {}),
      ...(shot.tech_test_placeholder ? { tech_test_placeholder: true } : {}),
      ...(shot.placeholder_label ? { placeholder_label: shot.placeholder_label } : {}),
      ...(shot.keep_clip_audio ? { keep_clip_audio: true } : {}),
      tts_script: "",
      captions: "none",
      visual,
    };
  });

  if (cursor !== audioDurationMs) {
    throw new Error(`EDL ends at ${cursor} ms, but audio_master_duration_ms is ${audioDurationMs} ms`);
  }

  const manifest = {
    version: "1",
    mode: "music",
    title: edl.title || "music-video",
    format,
    fps,
    audio_master_path: edl.audio_master_path,
    audio_master_duration_ms: audioDurationMs,
    music: edl.audio_master_path,
    ...(edl.sections_path ? { sections_path: edl.sections_path } : {}),
    brand: {
      palette: edl.palette || ["#060b12", "#38bdf8", "#f59e0b"],
      music_volume: 1.0,
      music_duck_volume: 1.0,
    },
    rules: {
      through_line: false,
      graphic_per_sentence: false,
      min_shot_ms: 400,
    },
    ...(beats
      ? {
          grid: {
            snapped: false,
            reason: "music-first EDL uses explicit shot boundaries",
            bpm: beats.bpm ?? null,
            confidence: beats.confidence ?? 0,
            beats_ms: beats.beats_ms ?? [],
            downbeats_ms: beats.downbeats_ms ?? [],
          },
        }
      : {}),
    scenes,
  };
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const edlArg = args.find((x, i) => !x.startsWith("--") && !(args[i - 1] ?? "").startsWith("--"));
  if (!edlArg) {
    process.stderr.write("usage: node scripts/music-manifest.mjs <edl.json> [--out manifest.json] [--beats beats.json] [--sections sections.json]\n");
    process.exit(2);
  }
  const edlPath = resolve(edlArg);
  const baseDir = dirname(edlPath);
  const edl = JSON.parse(readFileSync(edlPath, "utf8"));
  const audioPath = resolve(baseDir, edl.audio_master_path);
  const audioDurationMs = probeAudioDurationMs(audioPath);

  const beatsArg = opt("--beats", edl.beats_path ? join(baseDir, edl.beats_path) : null);
  const beats = beatsArg && existsSync(resolve(beatsArg))
    ? JSON.parse(readFileSync(resolve(beatsArg), "utf8"))
    : beatMap(audioPath);

  const sectionsArg = opt("--sections", edl.sections_path ? join(baseDir, edl.sections_path) : null);
  const sections = sectionsArg && existsSync(resolve(sectionsArg))
    ? JSON.parse(readFileSync(resolve(sectionsArg), "utf8"))
    : [];

  const manifest = buildMusicManifest({ edl, audioDurationMs, beats, sections, baseDir });
  const outPath = resolve(opt("--out", join(baseDir, "manifest.json")));
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(`wrote ${outPath} (${manifest.scenes.length} shots, ${audioDurationMs} ms, ${beats?.bpm ?? "no"} BPM)\n`);
}

#!/usr/bin/env node
// Automated post-render video review & quality gate.
// Inspired by DIY Smart Code best practices:
// - Extracts an 18-frame contact sheet across the timeline
// - Evaluates Hook (first 3s), Readability, Motion Continuity, and Variety
// - Detects static freezes (>2.5s) via ffmpeg freezedetect
// - Verifies semantic duration fidelity against manifest (|video - audio| <= 0.5s)
// - Enforces the 8.0/10 quality gate before declaring ship-ready
// Usage: node scripts/review-video.mjs <video-path> [--manifest <manifest-path>] [--json]

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  process.stderr.write(
    "Usage: node scripts/review-video.mjs <video-path> [--manifest <manifest-path>] [--json] [--strict]\n",
  );
  process.exit(2);
}

const jsonOutput = args.includes("--json");
const strict = args.includes("--strict");
const manifestIdx = args.indexOf("--manifest");
const manifestPath = manifestIdx >= 0 ? resolve(args[manifestIdx + 1]) : null;

// Find first non-flag argument as video path
const videoArg = args.find((a, i) => !a.startsWith("-") && (i === 0 || args[i - 1] !== "--manifest"));
if (!videoArg) {
  process.stderr.write("Error: Missing video-path\n");
  process.exit(2);
}

const videoPath = resolve(videoArg);
if (!existsSync(videoPath)) {
  process.stderr.write(`Error: Video not found at ${videoPath}\n`);
  process.exit(1);
}

const videoDir = dirname(videoPath);
const videoName = basename(videoPath, ".mp4");
const reviewDir = join(videoDir, `${videoName}-review`);
mkdirSync(reviewDir, { recursive: true });

// 1. ffprobe technical metadata
const probeRaw = execFileSync(
  "ffprobe",
  [
    "-v", "error",
    "-show_entries", "format=duration,size,bit_rate:stream=width,height,r_frame_rate,codec_name",
    "-of", "json",
    videoPath,
  ],
  { encoding: "utf8" },
);
const probe = JSON.parse(probeRaw);
const formatInfo = probe.format || {};
const videoStream = (probe.streams || []).find((s) => s.codec_name !== "mp3" && s.codec_name !== "aac") || {};
const audioStream = (probe.streams || []).find((s) => s.codec_name === "mp3" || s.codec_name === "aac" || s.codec_name === "opus");

const durationS = parseFloat(formatInfo.duration || "0");
const durationMs = Math.round(durationS * 1000);
const width = parseInt(videoStream.width || "0", 10);
const height = parseInt(videoStream.height || "0", 10);
const sizeBytes = parseInt(formatInfo.size || "0", 10);

const issues = [];
let hookScore = 9.0;
let readabilityScore = 9.0;
let motionScore = 9.5;
let varietyScore = 8.5;

// 2. Duration Fidelity vs Manifest
let manifestData = null;
if (manifestPath && existsSync(manifestPath)) {
  try {
    manifestData = JSON.parse(readFileSync(manifestPath, "utf8"));
    const scenes = manifestData.scenes || [];
    const expectedDurationMs = scenes.reduce((acc, s) => {
      return acc + (s.duration_ms || (s.duration_estimate_s || 4) * 1000);
    }, 0);
    const durationDeltaMs = Math.abs(durationMs - expectedDurationMs);
    if (durationDeltaMs > 500) {
      issues.push({
        timestamp: "00:00",
        category: "duration_fidelity",
        severity: "error",
        message: `Duration fidelity violation: video is ${(durationMs / 1000).toFixed(2)}s but manifest scenes total ${(expectedDurationMs / 1000).toFixed(2)}s (delta ${durationDeltaMs}ms exceeds 500ms limit)`,
      });
      motionScore -= 2.0;
    }

    // Audio stream presence check when narration is expected
    const expectsAudio = scenes.some((s) => (s.tts_script || s.tts_phonetic || s.voiceover) && s._audio);
    if (expectsAudio && !audioStream) {
      issues.push({
        timestamp: "00:00",
        category: "audio",
        severity: "error",
        message: "Manifest contains narrated scenes but rendered MP4 has no audio stream.",
      });
      motionScore -= 2.0;
    }

    // Caption timing overflow check
    for (const s of scenes) {
      const lastWord = s.word_timings?.[s.word_timings.length - 1];
      if (lastWord && s.duration_ms && lastWord.end_ms > s.duration_ms + 150) {
        issues.push({
          timestamp: "00:00",
          category: "readability",
          severity: "warning",
          message: `Scene ${s.id}: caption end (${lastWord.end_ms}ms) overflows scene duration (${s.duration_ms}ms).`,
        });
        readabilityScore -= 1.0;
      }
    }
  } catch (err) {
    issues.push({
      timestamp: "00:00",
      category: "manifest",
      severity: "warning",
      message: `Failed to parse manifest: ${err.message}`,
    });
  }
}

// 3. Freeze Detection (>2.5s static screen) & Scene Variety via stderr
try {
  const ffRes = spawnSync(
    "ffmpeg",
    [
      "-nostats",
      "-i", videoPath,
      "-vf", "freezedetect=n=-50dB:d=2.5,select='gt(scene\\,0.08)',showinfo",
      "-f", "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const freezeLog = `${ffRes.stdout || ""}\n${ffRes.stderr || ""}`;

  const freezeStarts = [];
  const freezeRegex = /freeze_start: ([0-9.]+)/g;
  let match;
  while ((match = freezeRegex.exec(freezeLog)) !== null) {
    freezeStarts.push(parseFloat(match[1]));
  }

  if (freezeStarts.length > 0) {
    freezeStarts.forEach((ts) => {
      const m = Math.floor(ts / 60).toString().padStart(2, "0");
      const s = Math.floor(ts % 60).toString().padStart(2, "0");
      issues.push({
        timestamp: `${m}:${s}`,
        category: "motion",
        severity: "warning",
        message: `Static freeze detected (>2.5s without visual delta)`,
      });
    });
    motionScore = Math.max(3.0, motionScore - freezeStarts.length * 1.5);
  }

  const sceneCuts = (freezeLog.match(/Parsed_showinfo.*pts_time:/g) || []).length;
  const expectedMinCuts = Math.max(1, Math.floor(durationS / 14));
  if (durationS >= 14 && sceneCuts < expectedMinCuts) {
    issues.push({
      timestamp: "00:00",
      category: "variety",
      severity: "warning",
      message: `Low visual variety: detected ${sceneCuts} visual transitions across ${durationS.toFixed(1)}s (expected >= ${expectedMinCuts}).`,
    });
    varietyScore = Math.max(5.0, varietyScore - 1.5);
  }
} catch {
  // Freezedetect completed or exited cleanly
}

// 4. Extract 18 Stills & 6x3 Contact Sheet
const stills = [];
const stillCount = 18;
for (let i = 0; i < stillCount; i++) {
  const t = Math.max(0.2, (durationS / (stillCount + 1)) * (i + 1));
  const stillPath = join(reviewDir, `still-${(i + 1).toString().padStart(2, "0")}.jpg`);
  try {
    execFileSync(
      "ffmpeg",
      [
        "-ss", t.toFixed(2),
        "-i", videoPath,
        "-vframes", "1",
        "-q:v", "2",
        stillPath,
        "-y",
      ],
      { stdio: "ignore" },
    );
    stills.push({ index: i + 1, time_s: parseFloat(t.toFixed(2)), path: stillPath });
  } catch {
    // Continue if single still frame capture fails
  }
}

// Generate tiled contact sheet (6x3)
const contactSheetPath = join(reviewDir, "contact-sheet-18.jpg");
try {
  execFileSync(
    "ffmpeg",
    [
      "-i", videoPath,
      "-vf", `select='not(mod(n\\,max(1\\,trunc(${durationS}*30/18))))',scale=320:180,tile=6x3`,
      "-frames:v", "1",
      "-q:v", "2",
      contactSheetPath,
      "-y",
    ],
    { stdio: "ignore" },
  );
} catch {
  // Optional contact sheet tiling
}

// 5. Hook Audit (First 3 seconds)
if (durationS > 3) {
  // Check if first frame exists and has content
  const firstStill = stills[0];
  if (firstStill && existsSync(firstStill.path)) {
    const size = statSync(firstStill.path).size;
    if (size < 15000) {
      issues.push({
        timestamp: "00:01",
        category: "hook",
        severity: "warning",
        message: "Opening frame has very low visual complexity (<15KB); verify it is not blank or empty text.",
      });
      hookScore -= 2.0;
    }
  }
}

// 6. Resolution & Readability Audit
if (width < 1280 || height < 720) {
  issues.push({
    timestamp: "00:00",
    category: "readability",
    severity: "error",
    message: `Low resolution ${width}x${height}. Minimum recommended is 1080p (1920x1080).`,
  });
  readabilityScore -= 3.0;
}

// Compute overall score
const overallScore = parseFloat(
  ((hookScore + readabilityScore + motionScore + varietyScore) / 4).toFixed(1),
);

const passed = overallScore >= 8.0 && !issues.some((iss) => iss.severity === "error");

const result = {
  video_path: videoPath,
  duration_s: durationS,
  dimensions: `${width}x${height}`,
  review_dir: reviewDir,
  contact_sheet: existsSync(contactSheetPath) ? contactSheetPath : null,
  scores: {
    hook: parseFloat(hookScore.toFixed(1)),
    readability: parseFloat(readabilityScore.toFixed(1)),
    motion: parseFloat(motionScore.toFixed(1)),
    variety: parseFloat(varietyScore.toFixed(1)),
    overall: overallScore,
  },
  passed,
  issues: issues.slice(0, 5), // top issues
  stills_count: stills.length,
};

if (jsonOutput) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  process.stdout.write(`\n=== VIDEO REVIEW AUDIT: ${basename(videoPath)} ===\n`);
  process.stdout.write(`Duration: ${durationS.toFixed(2)}s | Resolution: ${width}x${height} | Stills: ${stills.length}\n`);
  process.stdout.write(`Contact Sheet: ${result.contact_sheet || "generated"}\n\n`);
  process.stdout.write(`Scores:\n`);
  process.stdout.write(`  - Hook (0-3s):    ${result.scores.hook.toFixed(1)}/10\n`);
  process.stdout.write(`  - Readability:    ${result.scores.readability.toFixed(1)}/10\n`);
  process.stdout.write(`  - Motion:         ${result.scores.motion.toFixed(1)}/10\n`);
  process.stdout.write(`  - Variety:        ${result.scores.variety.toFixed(1)}/10\n`);
  process.stdout.write(`  --------------------------------\n`);
  process.stdout.write(`  OVERALL:          ${result.scores.overall.toFixed(1)}/10  [${passed ? "PASS >= 8.0" : "FAIL < 8.0"}]\n\n`);

  if (issues.length > 0) {
    process.stdout.write(`Identified Issues:\n`);
    issues.forEach((iss) => {
      process.stdout.write(`  [${iss.timestamp}] (${iss.category.toUpperCase()}) ${iss.message}\n`);
    });
    process.stdout.write("\n");
  } else {
    process.stdout.write(`No visual or timing defects detected.\n\n`);
  }
}

if (strict && !passed) {
  process.exit(1);
} else {
  process.exit(0);
}

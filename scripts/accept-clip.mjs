#!/usr/bin/env node
// Mini acceptance gate for short audio-conditioned or silent I2V generated clips.
// Verifies container streams via ffprobe, 16:9 aspect, duration within one frame
// tolerance (<= 1/fps at expected fps, default 30fps), audio preservation contract,
// provenance metadata, and emits explicit pending human visual QA checks.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ASPECT_MAP = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
};

export function parseFrameRate(rateStr) {
  if (!rateStr || typeof rateStr !== "string") return null;
  if (rateStr.includes("/")) {
    const [num, den] = rateStr.split("/").map(Number);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }
  const n = Number(rateStr);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ffprobeJson(filePath) {
  const raw = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      resolve(filePath),
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(raw);
}

// AAC encoder priming/padding can shift audio duration by tens of ms.
const AUDIO_TOL_S = 0.06;

export const DEFAULT_VISUAL_CHECKS = [
  "identity_matches_reference",
  "no_unrequested_elements",
  "set_and_props_intact",
];

export function evaluateClipAcceptance({
  probe,
  refAudioProbe = null,
  provenance = null,
  expect = {},
}) {
  const failures = [];
  const checks = [];
  const targetFps = Number(expect.fps ?? 30);
  const frameTolS = 1 / targetFps;
  const targetDurationS =
    expect.durationS !== undefined ? Number(expect.durationS) : 4;
  const targetAspect = expect.aspect || "16:9";
  const targetAspectRatio = ASPECT_MAP[targetAspect];

  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videoStreams = streams.filter((s) => s.codec_type === "video");
  const audioStreams = streams.filter((s) => s.codec_type === "audio");

  if (videoStreams.length === 0) {
    failures.push("missing video stream");
  } else {
    const v = videoStreams[0];
    const w = Number(v.width);
    const h = Number(v.height);
    const actualFps = parseFrameRate(v.avg_frame_rate || v.r_frame_rate);
    const videoDurS = Number(v.duration ?? probe?.format?.duration);

    checks.push({
      name: "video_stream",
      pass: w > 0 && h > 0,
      width: w,
      height: h,
      codec: v.codec_name || null,
      fps: actualFps ? Math.round(actualFps * 1000) / 1000 : null,
    });
    if (!(w > 0 && h > 0)) failures.push("invalid video dimensions");

    if (targetAspectRatio) {
      const actualRatio = w / h;
      const aspectDelta = Math.abs(actualRatio - targetAspectRatio) / targetAspectRatio;
      const aspectPass = aspectDelta <= 0.025;
      checks.push({
        name: "aspect_ratio",
        pass: aspectPass,
        expected: targetAspect,
        actual: `${w}x${h}`,
        rel_delta: Math.round(aspectDelta * 10000) / 10000,
      });
      if (!aspectPass) {
        failures.push(
          `aspect ${w}x${h} deviates from ${targetAspect} (${(aspectDelta * 100).toFixed(2)}%)`,
        );
      }
    }

    if (expect.strictFps && actualFps !== null) {
      const fpsDelta = Math.abs(actualFps - targetFps);
      const fpsPass = fpsDelta <= 0.5;
      checks.push({
        name: "frame_rate",
        pass: fpsPass,
        expected_fps: targetFps,
        actual_fps: Math.round(actualFps * 1000) / 1000,
      });
      if (!fpsPass) {
        failures.push(
          `fps ${actualFps.toFixed(2)} outside ${targetFps} +/- 0.5`,
        );
      }
    }

    if (!Number.isFinite(videoDurS) || videoDurS <= 0) {
      failures.push("missing or invalid video duration");
    } else {
      const durDeltaS = Math.abs(videoDurS - targetDurationS);
      const durPass = durDeltaS <= frameTolS + 1e-6;
      checks.push({
        name: "duration_within_one_frame",
        pass: durPass,
        expected_s: targetDurationS,
        actual_s: Math.round(videoDurS * 10000) / 10000,
        delta_s: Math.round(durDeltaS * 10000) / 10000,
        max_one_frame_tol_s: Math.round(frameTolS * 10000) / 10000,
      });
      if (!durPass) {
        failures.push(
          `video duration ${videoDurS.toFixed(4)}s differs from ${targetDurationS}s by ${durDeltaS.toFixed(4)}s (> 1/${targetFps}s = ${frameTolS.toFixed(4)}s)`,
        );
      }
    }
  }

  const audioMode = expect.audioMode || (refAudioProbe ? "preserved" : "any");
  if (audioMode === "silent") {
    const pass = audioStreams.length === 0;
    checks.push({
      name: "silent_video_only",
      pass,
      audio_streams: audioStreams.length,
    });
    if (!pass) {
      failures.push(
        `expected silent I2V clip (generate_audio=false), found ${audioStreams.length} audio stream(s)`,
      );
    }
  } else if (audioMode === "preserved") {
    if (audioStreams.length === 0) {
      failures.push("expected preserved original audio stream, found none");
      checks.push({ name: "original_audio_preserved", pass: false });
    } else {
      const clipAudioDur = Number(
        audioStreams[0].duration ?? probe?.format?.duration,
      );
      const refAudioDur = Number(
        refAudioProbe?.streams?.find((s) => s.codec_type === "audio")?.duration ??
          refAudioProbe?.format?.duration,
      );
      const delta =
        Number.isFinite(clipAudioDur) && Number.isFinite(refAudioDur)
          ? Math.abs(clipAudioDur - refAudioDur)
          : null;
      const pass =
        delta !== null &&
        delta <= AUDIO_TOL_S + 1e-6 &&
        Math.abs(clipAudioDur - targetDurationS) <= AUDIO_TOL_S + 1e-6;
      checks.push({
        name: "original_audio_preserved",
        pass,
        clip_audio_s: Number.isFinite(clipAudioDur)
          ? Math.round(clipAudioDur * 10000) / 10000
          : null,
        ref_audio_s: Number.isFinite(refAudioDur)
          ? Math.round(refAudioDur * 10000) / 10000
          : null,
        delta_s: delta !== null ? Math.round(delta * 10000) / 10000 : null,
      });
      if (!pass) {
        failures.push(
          `preserved audio mismatch: clip=${clipAudioDur}s ref=${refAudioDur}s target=${targetDurationS}s`,
        );
      }
    }
  }

  if (provenance !== null) {
    const missing = [];
    if (!provenance.model) missing.push("model");
    if (!provenance.request_redacted?.prompt && !provenance.prompt) {
      missing.push("prompt");
    }
    if (
      !provenance.refs?.first_frame?.sha256 &&
      !provenance.refs?.first_frame?.url
    ) {
      missing.push("refs.first_frame");
    }
    if (
      provenance.cost_usd === undefined &&
      provenance.est_cost_usd === undefined
    ) {
      missing.push("cost_usd|est_cost_usd");
    }
    const provPass = missing.length === 0;
    checks.push({ name: "provenance", pass: provPass, missing });
    if (!provPass) {
      failures.push(`provenance missing required fields: ${missing.join(", ")}`);
    }
  }

  return {
    mechanical_pass: failures.length === 0,
    failures,
    checks,
    visual_qa_status: "PENDING_HUMAN_VISUAL_REVIEW",
    visual_checks_required:
      Array.isArray(expect.checks) && expect.checks.length > 0
        ? expect.checks.map(String)
        : DEFAULT_VISUAL_CHECKS,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--strict-fps") args.strictFps = true;
    else if (k === "--json") args.json = true;
    else if (k.startsWith("--") && i + 1 < argv.length) {
      args[k.slice(2)] = argv[++i];
    }
  }
  return args;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.clip) {
    process.stderr.write(
      "Usage: node scripts/accept-clip.mjs --clip <file.mp4> [--duration-s 4] [--fps 30] [--aspect 16:9] [--strict-fps] [--audio-mode silent|preserved|any] [--ref-audio <ref.wav>] [--provenance <prov.json>] [--checks a,b,c]\n",
    );
    process.exit(2);
  }
  if (!existsSync(resolve(args.clip))) {
    process.stderr.write(`Clip not found: ${args.clip}\n`);
    process.exit(2);
  }
  const probe = ffprobeJson(args.clip);
  const refAudioProbe = args["ref-audio"] ? ffprobeJson(args["ref-audio"]) : null;
  const provenance = args.provenance
    ? JSON.parse(readFileSync(resolve(args.provenance), "utf8"))
    : null;

  const report = evaluateClipAcceptance({
    probe,
    refAudioProbe,
    provenance,
    expect: {
      durationS: args["duration-s"] ?? 4,
      fps: args.fps ?? 30,
      aspect: args.aspect ?? "16:9",
      strictFps: Boolean(args.strictFps),
      audioMode: args["audio-mode"],
      checks: args.checks
        ? args.checks.split(",").map((c) => c.trim()).filter(Boolean)
        : undefined,
    },
  });

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.mechanical_pass ? 0 : 1);
}

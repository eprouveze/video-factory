#!/usr/bin/env node
// finish adapter (core tier) — apply a pre-arranged "look" to a graded-ready master.
// Headless, no DaVinci, no license. Contract: { video_path, look, out_path } -> { video_path }
// For broadcast-only ops (Super Scale, Magic Mask, HDR) use the `davinci` adapter instead.
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Curated looks as ffmpeg filter chains (no external .cube needed for the core tier).
// Swap any value for `lut3d=/path/to/look.cube` once you have graded LUTs.
const LOOKS = {
  none: "null",
  cinematic:
    "curves=preset=medium_contrast,eq=saturation=1.06:gamma=0.98,vignette=PI/5,noise=alls=4:allf=t",
  "warm-doc":
    "colorbalance=rm=0.06:gm=0.0:bm=-0.06,eq=saturation=1.02:contrast=1.03,vignette=PI/6",
  "punchy-social":
    "eq=saturation=1.25:contrast=1.12,unsharp=5:5:0.7,vignette=PI/7",
  noir: "hue=s=0,curves=preset=strong_contrast,vignette=PI/4",
};

const req = JSON.parse(readFileSync(0, "utf8"));
const look = req.look || "cinematic";
const chain = LOOKS[look];
if (!chain) {
  process.stderr.write(
    `unknown look "${look}". options: ${Object.keys(LOOKS).join(", ")}\n`,
  );
  process.exit(2);
}

const inPath = resolve(req.video_path);
const out = resolve(req.out_path);
mkdirSync(dirname(out), { recursive: true });

const args = [
  "-y",
  "-loglevel",
  "error",
  "-i",
  inPath,
  "-vf",
  chain,
  "-c:a",
  "copy",
  out,
];
const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
ff.on("close", (code) => {
  if (code !== 0) process.exit(code || 1);
  process.stdout.write(JSON.stringify({ video_path: out }) + "\n");
});
ff.on("error", (e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});

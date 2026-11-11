#!/usr/bin/env node
// Look check for a generated still: how much of the picture sits on the brand palette, its
// size, and a fingerprint for spotting near-duplicates. Needs only ffmpeg/ffprobe.
// A still that fails is remade at the source; grading it afterwards hides the drift.
//
// usage: node scripts/palette-score.mjs <image> --palette "#0b0b0f,#ffd24a" [--min 60]
// out:   { palette_score (0-100), width, height, ahash }
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hexRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) throw new Error(`bad hex colour "${h}"`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// sRGB → hue (degrees), chroma (0-1), lightness (0-1)
function hcl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const c = mx - mn;
  let h = 0;
  if (c > 1e-6) {
    if (mx === r) h = ((g - b) / c) % 6;
    else if (mx === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, c, l: (mx + mn) / 2 };
}

const hueDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// Score from raw rgb24 pixels. A coloured pixel is on-palette when its hue is within 30° of
// a coloured palette entry; a neutral pixel is on-palette when the palette has a neutral of
// similar lightness. Coloured pixels weigh double: they are what reads as "the look".
export function scorePixels(rgb, paletteHex) {
  const pal = paletteHex.map(hexRgb).map(hcl);
  const hues = pal.filter((p) => p.c >= 0.15);
  const neutrals = pal.filter((p) => p.c < 0.15);
  let on = 0;
  let total = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const p = hcl([rgb[i], rgb[i + 1], rgb[i + 2]]);
    if (p.c >= 0.15) {
      const d = hues.length
        ? Math.min(...hues.map((q) => hueDist(q.h, p.h)))
        : 180;
      total += 2;
      on += 2 * (d <= 30 ? 1 : d >= 60 ? 0 : (60 - d) / 30);
    } else {
      const d = neutrals.length
        ? Math.min(...neutrals.map((q) => Math.abs(q.l - p.l)))
        : 1;
      total += 1;
      on +=
        d <= 0.25
          ? 1
          : d >= 0.5
            ? hues.length
              ? 0.25
              : 0
            : 1 - (d - 0.25) * 3;
    }
  }
  return total ? Math.round((100 * on) / total) : 0;
}

const raw = (path, vf, pix) => {
  const r = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      vf,
      "-pix_fmt",
      pix,
      "-f",
      "rawvideo",
      "-",
    ],
    {
      maxBuffer: 1 << 26,
    },
  );
  if (r.status !== 0)
    throw new Error(
      `ffmpeg could not read ${path}: ${String(r.stderr).slice(0, 200)}`,
    );
  return r.stdout;
};

export function lookOf(path, paletteHex) {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      path,
    ],
    {
      encoding: "utf8",
    },
  );
  const [width, height] = String(probe.stdout).trim().split(",").map(Number);
  const grey = raw(path, "scale=8:8:flags=area", "gray");
  const mean = grey.reduce((a, b) => a + b, 0) / 64;
  let ahash = "";
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let k = 0; k < 4; k++) nib = (nib << 1) | (grey[i + k] > mean ? 1 : 0);
    ahash += nib.toString(16);
  }
  const look = { width, height, ahash };
  if (paletteHex?.length)
    look.palette_score = scorePixels(
      raw(path, "scale=64:64:flags=area", "rgb24"),
      paletteHex,
    );
  return look;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const a = process.argv.slice(2);
  const opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const file = a.find(
    (x, i) => !x.startsWith("--") && !(a[i - 1] ?? "").startsWith("--"),
  );
  const palette = opt("--palette", "");
  if (!file || !palette) {
    process.stderr.write(
      'usage: palette-score.mjs <image> --palette "#0b0b0f,#ffd24a" [--min 60]\n',
    );
    process.exit(2);
  }
  const look = lookOf(file, palette.split(","));
  process.stdout.write(JSON.stringify(look) + "\n");
  process.exit(look.palette_score >= +opt("--min", 60) ? 0 : 1);
}

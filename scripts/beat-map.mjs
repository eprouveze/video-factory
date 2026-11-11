#!/usr/bin/env node
// Beat map of a music bed: tempo, every beat and every downbeat, measured from the audio.
// Needs only ffmpeg. A bed with no clear pulse comes back `reliable: false`, and the cut
// snapper then leaves the cuts on their word boundaries.
//
// usage: node scripts/beat-map.mjs <audio> [--out beats.json] [--bpm-min 60] [--bpm-max 180]
// out:   { duration_ms, bpm, confidence, reliable, beats_ms[], downbeats_ms[] }
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 8000;
const HOP = 80; // 10 ms
const WIN = 320;

function decode(path, filter) {
  const r = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-ac",
      "1",
      "-ar",
      String(SR),
      ...(filter ? ["-af", filter] : []),
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 1 << 30 },
  );
  if (r.status !== 0)
    throw new Error(
      `ffmpeg could not decode ${path}: ${String(r.stderr).slice(0, 200)}`,
    );
  return new Float32Array(
    r.stdout.buffer,
    r.stdout.byteOffset,
    Math.floor(r.stdout.byteLength / 4),
  );
}

// Onset envelope: positive change of log energy, one value per 10 ms.
function onsetEnvelope(x) {
  const n = Math.max(0, Math.floor((x.length - WIN) / HOP));
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < WIN; k++) {
      const v = x[i * HOP + k];
      s += v * v;
    }
    e[i] = Math.log1p(1000 * (s / WIN));
  }
  const env = new Float64Array(n);
  for (let i = 1; i < n; i++) env[i] = Math.max(0, e[i] - e[i - 1]);
  return { env, energy: e };
}

const at = (env, f) => {
  const i = Math.floor(f);
  if (i < 0 || i + 1 >= env.length) return 0;
  const t = f - i;
  return env[i] * (1 - t) + env[i + 1] * t;
};

// Mean envelope on a pulse train of this period and phase (frames).
function comb(env, period, phase) {
  let s = 0;
  let n = 0;
  for (let f = phase; f < env.length - 1; f += period) {
    s += at(env, f);
    n++;
  }
  return n ? s / n : 0;
}

function bestPhase(env, period) {
  let best = { score: -1, phase: 0 };
  for (let p = 0; p < period; p += 1) {
    const score = comb(env, period, p);
    if (score > best.score) best = { score, phase: p };
  }
  return best;
}

export function beatMapFromSamples(
  low,
  full,
  { bpmMin = 60, bpmMax = 180 } = {},
) {
  let { env, energy } = onsetEnvelope(low);
  const flat = (a) => !a.some((v) => v > 1e-6);
  // a bed with no low end (solo piano, pads): fall back to the full band
  if (flat(env) && full)
    ({ env, energy } = onsetEnvelope(typeof full === "function" ? full() : full));
  const duration_ms = Math.round((low.length / SR) * 1000);
  if (flat(env))
    return {
      duration_ms,
      bpm: null,
      confidence: 0,
      reliable: false,
      beats_ms: [],
      downbeats_ms: [],
    };

  const fps = SR / HOP;
  const periodOf = (bpm) => (60 / bpm) * fps;
  // a mild preference for the middle of the range settles half/double-time ties
  const prior = (bpm) => Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2);
  const scan = (lo, hi, step) => {
    const out = [];
    for (let bpm = lo; bpm <= hi + 1e-9; bpm += step) {
      const b = bestPhase(env, periodOf(bpm));
      out.push({
        bpm,
        raw: b.score,
        score: b.score * prior(bpm),
        phase: b.phase,
      });
    }
    return out;
  };
  const coarse = scan(bpmMin, bpmMax, 0.5);
  const top = coarse.reduce((a, b) => (b.score > a.score ? b : a));
  const fine = scan(
    Math.max(bpmMin, top.bpm - 0.6),
    Math.min(bpmMax, top.bpm + 0.6),
    0.02,
  );
  const best = fine.reduce((a, b) => (b.score > a.score ? b : a));

  const sorted = coarse.map((c) => c.raw).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1e-9;
  const confidence = +(best.raw / median).toFixed(2);

  const period = periodOf(best.bpm);
  const beats = [];
  for (let f = best.phase; f < env.length - 1; f += period) {
    // settle each beat on the local onset peak, at most 30 ms away
    let pf = f;
    let pv = at(env, f);
    for (let d = -3; d <= 3; d++) {
      const v = at(env, f + d);
      if (v > pv * 1.25) {
        pv = v;
        pf = f + d;
      }
    }
    beats.push(pf);
  }
  // bar phase: the beat-of-four that carries the most energy is beat one
  const sums = [0, 0, 0, 0];
  beats.forEach((f, i) => {
    sums[i % 4] += at(energy, f + 2);
  });
  const down = sums.indexOf(Math.max(...sums));
  const ms = (f) => Math.round((f / fps) * 1000 + (WIN / 2 / SR) * 1000);
  const beats_ms = beats.map(ms);
  return {
    duration_ms,
    bpm: +best.bpm.toFixed(2),
    confidence,
    reliable: confidence >= 1.8 && beats_ms.length >= 8,
    beats_ms,
    downbeats_ms: beats_ms.filter((_, i) => i % 4 === down),
  };
}

export function beatMap(path, opts) {
  const low = decode(path, "highpass=f=30,lowpass=f=180");
  const full = () => decode(path, null);
  return beatMapFromSamples(low, full, opts);
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
  if (!file) {
    process.stderr.write(
      "usage: beat-map.mjs <audio> [--out beats.json] [--bpm-min 60] [--bpm-max 180]\n",
    );
    process.exit(2);
  }
  const res = beatMap(file, {
    bpmMin: +opt("--bpm-min", 60),
    bpmMax: +opt("--bpm-max", 180),
  });
  const out = opt("--out", null);
  if (out) writeFileSync(out, JSON.stringify(res) + "\n");
  process.stdout.write(
    out
      ? `${res.bpm ?? "no"} BPM · ${res.beats_ms.length} beats · confidence ${res.confidence}${res.reliable ? "" : " (NOT reliable: cuts stay on words)"} → ${out}\n`
      : JSON.stringify(res) + "\n",
  );
}

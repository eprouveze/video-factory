// Every gate gets a negative control: a plan that is good except for one defect must fail
// on exactly that gate. A gate that cannot be made to fail is not a gate.
// run: npm test   (node --test tests/*.test.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validate } from "../scripts/validate-manifest.mjs";
import {
  approvalHash,
  isApproved,
  anchorMs,
  cutFrames,
} from "../scripts/lib/manifest-lib.mjs";
import { beatMap } from "../scripts/beat-map.mjs";
import { snapToGrid } from "../scripts/snap-grid.mjs";
import { scorePixels, lookOf } from "../scripts/palette-score.mjs";

const good = () => ({
  version: "1",
  title: "t",
  format: ["16:9"],
  fps: 30,
  brand: { palette: ["#0b0b0f", "#ffd24a"] },
  hook: { type: "bold_claim", text: "Most AI video is slop." },
  through_line: {
    kind: "counter",
    label: "viewers left",
    states: [
      { scene: "s1", value: 100 },
      { scene: "s2", value: 45 },
      { scene: "s3", value: 80 },
    ],
  },
  scenes: [
    {
      id: "s1",
      tts_script:
        "Most AI video is generic. You forget it before the next scroll.",
      duration_estimate_s: 4,
      visual: {
        source: "code",
        component: "TitleCard",
        props: { headline: "Most AI video is slop." },
      },
      graphics: [
        { kind: "strike", anchor: "forget", props: { text: "remembered" } },
      ],
    },
    {
      id: "s2",
      tts_script:
        "Fifty percent of viewers leave in three seconds. The first frame decides.",
      duration_estimate_s: 5,
      visual: {
        source: "code",
        component: "StatCard",
        props: { value: "3s", label: "where viewers leave" },
      },
      graphics: [
        { kind: "gauge", anchor: "first frame", props: { value: 0.5 } },
      ],
    },
    {
      id: "s3",
      tts_script: "Write the plan first. Then build every layer on purpose.",
      duration_estimate_s: 4,
      visual: {
        source: "code",
        component: "CTA",
        props: { headline: "Plan first." },
      },
      graphics: [
        {
          kind: "checklist",
          anchor: "every layer",
          props: { items: ["voice", "picture"] },
        },
      ],
    },
  ],
});

const gatesOf = (m, opts) => validate(m, opts).errors.map((e) => e.gate);

test("the good plan passes every gate", () => {
  const r = validate(good());
  assert.deepEqual(r.errors, []);
  assert.equal(r.pass, true);
});

test("hook: missing text, too long, or nothing on screen in the first second", () => {
  const a = good();
  delete a.hook;
  assert.ok(gatesOf(a).includes("hook"));
  const b = good();
  b.hook.text =
    "one two three four five six seven eight nine ten eleven twelve thirteen";
  assert.ok(gatesOf(b).includes("hook"));
  const c = good();
  c.scenes[0].visual = { source: "image", visual_brief: "a dark room" };
  c.scenes[0].graphics = [
    { kind: "strike", anchor: "forget", props: {} },
    { kind: "tag", anchor: "generic", props: {} },
  ];
  // both graphics enter after 1.0 s of a 4 s scene only if anchored late: "generic" is word 5 of 12
  c.scenes[0].graphics[1].anchor = "scroll";
  assert.ok(gatesOf(c).includes("hook"));
});

test("graphics: a sentence with no graphic fails; stillness with a reason exempts it", () => {
  const m = good();
  m.scenes[1].graphics = [];
  assert.ok(gatesOf(m).includes("graphics"));
  m.scenes[1].stillness = "the number holds alone";
  assert.ok(!gatesOf(m).includes("graphics"));
});

test("graphics: an anchor the narration never says fails", () => {
  const m = good();
  m.scenes[2].graphics[0].anchor = "blockchain";
  assert.ok(gatesOf(m).includes("graphics"));
});

test("variety: the same kind three times running fails", () => {
  const m = good();
  for (const s of m.scenes) {
    s.visual = {
      source: "image",
      asset: "a.png",
      shot: { motion: s.id === "s2" ? "pan" : "push" },
    };
    s.stillness = "x";
    s.graphics = [
      { kind: "tag", anchor: s.tts_script.split(" ")[0], props: {} },
    ];
  }
  assert.ok(gatesOf(m).includes("variety"));
});

test("through-line: missing, static, or out of order fails", () => {
  const a = good();
  delete a.through_line;
  assert.ok(gatesOf(a).includes("through-line"));
  const b = good();
  b.through_line.states[1].value = 100;
  assert.ok(gatesOf(b).includes("through-line"));
  const c = good();
  c.through_line.states.reverse();
  assert.ok(gatesOf(c).includes("through-line"));
  const d = good();
  delete d.through_line;
  d.rules = { through_line: false };
  assert.ok(!gatesOf(d).includes("through-line"));
});

test("pacing: a shot under a second fails unless it is a declared run; still moves never repeat", () => {
  const m = good();
  m.scenes[1].duration_ms = 600;
  assert.ok(gatesOf(m).includes("pacing"));
  m.scenes[1].run = true;
  assert.ok(!gatesOf(m).includes("pacing"));
  const k = good();
  k.scenes[1].visual = {
    source: "image",
    asset: "a.png",
    shot: { motion: "pan" },
  };
  k.scenes[2].visual = {
    source: "image",
    asset: "b.png",
    shot: { motion: "pan" },
  };
  k.scenes[1].graphics.push({ kind: "tag", anchor: "Fifty", props: {} });
  k.scenes[2].graphics.push({ kind: "label", anchor: "plan", props: {} });
  assert.ok(gatesOf(k).includes("pacing"));
});

test("approval: any creative edit makes it stale; produced fields do not", () => {
  const m = good();
  m.approval = {
    hash: approvalHash(m),
    by: "reviewer",
    at: "2026-01-01T00:00:00Z",
  };
  assert.equal(isApproved(m), true);
  m.scenes[0].duration_ms = 4321;
  m.scenes[0].word_timings = [{ word: "Most", start_ms: 0, end_ms: 200 }];
  m.scenes[0]._audio = "audio/s1.mp3";
  m.music = "audio/music.mp3";
  m._music_generated = true;
  m.grid = { snapped: false };
  assert.equal(
    isApproved(m),
    true,
    "production must not invalidate the approval",
  );
  m.scenes[0].tts_script += " Really.";
  assert.equal(isApproved(m), false);
  assert.ok(gatesOf(m, { requireApproval: true }).includes("approval"));
  const n = good();
  assert.ok(gatesOf(n, { requireApproval: true }).includes("approval"));
  // a SUPPLIED music bed and a hand-set duration are creative: changing either is an edit
  const bed = good();
  bed.music = "audio/bed-a.mp3";
  bed.approval = { hash: approvalHash(bed), by: "reviewer", at: "2026-01-01T00:00:00Z" };
  bed.music = "audio/bed-b.mp3";
  assert.equal(isApproved(bed), false, "swapping a supplied bed must need approval again");
  bed.music = "audio/bed-a.mp3";
  assert.equal(isApproved(bed), true);
  // a silent scene's length is authored: re-pacing it is an edit, snapping it is not
  const silent = good();
  silent.scenes[1].tts_script = "";
  silent.scenes[1].duration_ms = 5000;
  silent.approval = { hash: approvalHash(silent), by: "reviewer", at: "2026-01-01T00:00:00Z" };
  silent.scenes[1].audio_ms = 5000;
  silent.scenes[1].duration_ms = 5400;
  assert.equal(isApproved(silent), true, "snap-grid must not invalidate the approval");
  delete silent.scenes[1].audio_ms;
  silent.scenes[1].duration_ms = 9000;
  assert.equal(isApproved(silent), false, "re-pacing a hand-set duration must need approval again");
  // a narrated scene's duration is measured: writing it back is production, not an edit
  const narr = good();
  narr.scenes[1].duration_ms = 5000;
  narr.approval = { hash: approvalHash(narr), by: "reviewer", at: "2026-01-01T00:00:00Z" };
  narr.scenes[1].duration_ms = 4321;
  narr.scenes[1]._audio = "audio/s2.mp3";
  assert.equal(isApproved(narr), true);
});

const registry = {
  capabilities: {
    tts: {
      default: "paid",
      adapters: { paid: { tier: "plugin", est_usd: 0.01, est_unit: "second" } },
    },
    image: { default: "img", adapters: { img: { tier: "plugin" } } },
    clip: {
      default: "vid",
      adapters: { vid: { tier: "plugin", est_usd: 0.25, est_unit: "second" } },
    },
    music: { default: "m", adapters: { m: { tier: "core" } } },
    sfx: { default: "x", adapters: { x: { tier: "core" } } },
  },
};

test("budget: over the cap, unpriced under a cap, and frozen all fail", () => {
  const over = good();
  over.budget = { cap_usd: 0.1 };
  assert.ok(gatesOf(over, { registry }).includes("budget"));
  const fits = good();
  fits.budget = { cap_usd: 5 };
  assert.ok(!gatesOf(fits, { registry }).includes("budget"));
  const unpriced = good();
  unpriced.budget = { cap_usd: 50 };
  unpriced.scenes[2].visual = {
    source: "image",
    visual_brief: "an empty desk at dawn",
  };
  unpriced.scenes[2].graphics.push({ kind: "tag", anchor: "Write", props: {} });
  assert.ok(gatesOf(unpriced, { registry }).includes("budget"));
  const frozen = good();
  frozen.budget = { frozen: true };
  assert.ok(gatesOf(frozen, { registry }).includes("budget"));
});

test("anchors resolve to real word timings when present", () => {
  const s = {
    tts_script: "One two three.",
    duration_ms: 3000,
    word_timings: [
      { word: "One", start_ms: 100, end_ms: 400 },
      { word: "two", start_ms: 900, end_ms: 1200 },
      { word: "three.", start_ms: 2100, end_ms: 2600 },
    ],
  };
  assert.equal(anchorMs(s, { anchor: "three" }), 2100);
  delete s.word_timings;
  assert.equal(anchorMs(s, { anchor: "two" }), 1000);
});

// ── beat map + cut snapping ──────────────────────────────────────────────────────────
function clickTrack(path, { bpm, offsetMs, seconds }) {
  const sr = 22050;
  const n = sr * seconds;
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(36 + n * 2, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(sr, 24);
  pcm.writeUInt32LE(sr * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(n * 2, 40);
  const period = (60 / bpm) * sr;
  const off = (offsetMs / 1000) * sr;
  for (let b = 0; off + b * period < n; b++) {
    const start = Math.round(off + b * period);
    const amp = b % 4 === 0 ? 0.95 : 0.45; // beat one of each bar is louder
    for (let k = 0; k < sr * 0.08 && start + k < n; k++) {
      const v =
        amp *
        Math.exp(-k / (sr * 0.02)) *
        Math.sin((2 * Math.PI * 70 * k) / sr);
      pcm.writeInt16LE(Math.round(v * 32000), 44 + (start + k) * 2);
    }
  }
  writeFileSync(path, pcm);
}

const dir = mkdtempSync(join(tmpdir(), "vf-test-"));

test("beat map: finds tempo, beats and bar phase of a known click track", () => {
  const wav = join(dir, "click.wav");
  clickTrack(wav, { bpm: 128, offsetMs: 250, seconds: 20 });
  const r = beatMap(wav);
  assert.ok(Math.abs(r.bpm - 128) < 0.5, `bpm ${r.bpm}`);
  assert.equal(r.reliable, true);
  const period = 60000 / 128;
  for (const t of r.beats_ms.slice(0, 30)) {
    const k = Math.round((t - 250) / period);
    assert.ok(
      Math.abs(t - (250 + k * period)) <= 30,
      `beat at ${t} ms is off the grid`,
    );
  }
  const k0 = Math.round((r.downbeats_ms[0] - 250) / period);
  assert.equal(Math.abs(k0 % 4), 0, "downbeats must be the accented beat");
});

test("beat map: silence is reported as not reliable", () => {
  const wav = join(dir, "silence.wav");
  clickTrack(wav, { bpm: 0.001, offsetMs: 999999, seconds: 6 });
  assert.equal(beatMap(wav).reliable, false);
});

test("snap-grid: every cut lands on a beat, narration is only ever held longer", () => {
  const m = good();
  const natural = [3210, 4777, 3905];
  m.scenes.forEach((s, i) => (s.duration_ms = natural[i]));
  const period = 60000 / 100;
  const beats_ms = Array.from({ length: 60 }, (_, i) =>
    Math.round(200 + i * period),
  );
  const beats = {
    reliable: true,
    bpm: 100,
    confidence: 5,
    beats_ms,
    downbeats_ms: beats_ms.filter((_, i) => i % 4 === 0),
  };
  snapToGrid(m, beats);
  assert.equal(m.grid.snapped, true);
  m.scenes.forEach((s, i) => {
    assert.equal(s.audio_ms, natural[i]);
    assert.ok(s.duration_ms >= natural[i], "a scene was shortened");
  });
  for (const c of cutFrames(m).slice(0, -1))
    assert.ok(
      Math.min(...beats_ms.map((t) => Math.abs(t - c.ms))) <= 30,
      `cut at ${c.ms} ms is off the beat`,
    );
  assert.ok(!gatesOf(m).includes("grid"));
  // negative control: move one scene by 150 ms and the grid gate must catch it
  m.scenes[0].duration_ms += 150;
  assert.ok(gatesOf(m).includes("grid"));
  // idempotent: snapping again restores the grid from the kept narration length
  snapToGrid(m, beats);
  assert.ok(!gatesOf(m).includes("grid"));
});

test("snap-grid: a bed with no pulse leaves the cuts alone", () => {
  const m = good();
  m.scenes.forEach((s) => (s.duration_ms = 3000));
  snapToGrid(m, { reliable: false, beats_ms: [] });
  assert.equal(m.grid.snapped, false);
  assert.equal(m.scenes[0].duration_ms, 3000);
});

// ── look ─────────────────────────────────────────────────────────────────────────────
const solid = (rgb, n = 64) =>
  Buffer.from(Array.from({ length: n }, () => rgb).flat());

test("palette score: on-palette colour scores high, an off-palette hue scores low", () => {
  const pal = ["#0b0b0f", "#ffd24a"];
  assert.ok(scorePixels(solid([250, 205, 70]), pal) >= 90);
  assert.ok(scorePixels(solid([12, 12, 16]), pal) >= 90);
  assert.ok(scorePixels(solid([40, 90, 240]), pal) <= 10);
});

test("look gate: low palette score, small plate and near-duplicate all fail", () => {
  const ppm = (path, rgb, w, h) =>
    writeFileSync(
      path,
      Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), solid(rgb, w * h)]),
    );
  const a = join(dir, "blue.ppm");
  ppm(a, [40, 90, 240], 1024, 576);
  const look = lookOf(a, ["#0b0b0f", "#ffd24a"]);
  assert.equal(look.width, 1024);
  assert.ok(look.palette_score <= 10);
  assert.equal(look.ahash.length, 16);

  const m = good();
  m.scenes[0]._look = look;
  assert.ok(gatesOf(m).includes("look"));
  const s = good();
  s.scenes[0]._look = {
    palette_score: 90,
    width: 400,
    height: 225,
    ahash: "ffff0000ffff0000",
  };
  assert.ok(gatesOf(s).includes("look"));
  const d = good();
  d.scenes[0]._look = {
    palette_score: 90,
    width: 1920,
    height: 1080,
    ahash: "ffff0000ffff0000",
  };
  d.scenes[1]._look = {
    palette_score: 90,
    width: 1920,
    height: 1080,
    ahash: "ffff0000ffff0001",
  };
  assert.ok(gatesOf(d).includes("look"));
  d.scenes[1]._look.ahash = "0000ffff0000ffff";
  assert.ok(!gatesOf(d).includes("look"));
});

test("registry: every list-price estimate names its source and the date it was read", () => {
  const reg = JSON.parse(
    readFileSync(new URL("../providers/providers.json", import.meta.url), "utf8"),
  );
  for (const [cap, c] of Object.entries(reg.capabilities))
    for (const [name, a] of Object.entries(c.adapters)) {
      if (a.est_usd === undefined) continue;
      const id = `${cap}:${name}`;
      assert.ok(typeof a.est_usd === "number" && a.est_usd >= 0, id);
      assert.match(a.est_source ?? "", /^https:\/\//, id);
      assert.match(a.est_as_of ?? "", /^\d{4}-\d{2}-\d{2}$/, id);
      assert.ok([undefined, "second"].includes(a.est_unit), id);
    }
});

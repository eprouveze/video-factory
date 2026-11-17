import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../scripts/validate-manifest.mjs";
import { writeTake, readTake, listTakes, updateTake } from "../scripts/take-record.mjs";
import { buildShotRows, renderShotTable } from "../scripts/shot-table.mjs";
import { buildCues, toSrt, toVtt, formatSrtTime, formatVttTime } from "../scripts/srt-from-words.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = () => {
  const dir = mkdtempSync(join(tmpdir(), "vf-mv-"));
  const prompt = join(dir, "p.txt");
  writeFileSync(prompt, "a prompt. No text, no captions.");
  return { dir, prompt, takes: join(dir, "takes") };
};
const input = (prompt, extra = {}) => ({
  shot_id: "S012",
  model: "model-x",
  resolution: "768p",
  duration_s: 5,
  prompt_file: prompt,
  reference_paths: ["refs/a.png"],
  cost_estimate_usd: 0.4,
  ...extra,
});

test("take record refuses a missing prompt file", () => {
  const { dir, takes } = base();
  assert.throws(() => writeTake(takes, input(join(dir, "nope.txt"))), /prompt file does not exist/);
  assert.equal(listTakes(takes, "S012").length, 0);
});

test("take record writes numbered takes, refuses a duplicate take and the 4th take", () => {
  const { prompt, takes } = base();
  const t1 = writeTake(takes, input(prompt));
  assert.equal(t1.take, 1);
  assert.equal(t1.prompt_sha256.length, 64);
  assert.throws(() => writeTake(takes, input(prompt, { take: 1 })), /already has a record/);
  writeTake(takes, input(prompt));
  writeTake(takes, input(prompt));
  assert.equal(listTakes(takes, "S012").length, 3);
  assert.throws(() => writeTake(takes, input(prompt)), /max 3/);
  const t4 = writeTake(takes, input(prompt), { allowExtra: true });
  assert.equal(t4.take, 4);
  assert.throws(() => writeTake(takes, input(prompt, { shot_id: "../x" })), /invalid shot id/);
  assert.throws(() => writeTake(takes, input(prompt, { shot_id: "S013", verdict: "great" })), /verdict/);
});

test("take record stores the seed and the continuity line, and rejects a bad seed", () => {
  const { prompt, takes } = base();
  const t1 = writeTake(takes, input(prompt, { seed: "7", continuity: "grey coat on, cup in left hand" }));
  assert.equal(t1.seed, 7);
  assert.equal(t1.continuity, "grey coat on, cup in left hand");
  const t2 = writeTake(takes, input(prompt));
  assert.equal(t2.seed, null);
  assert.equal(t2.continuity, null);
  updateTake(takes, "S012", 2, { seed: 11, continuity: "coat off" });
  const r = readTake(takes, "S012", 2);
  assert.equal(r.seed, 11);
  assert.equal(r.continuity, "coat off");
  assert.throws(() => writeTake(takes, input(prompt, { seed: "abc" })), /seed must be a non-negative integer/);
  assert.throws(() => updateTake(takes, "S012", 1, { seed: -1 }), /seed must be a non-negative integer/);
  assert.throws(() => updateTake(takes, "S012", 1, { seed: "9007199254740993" }), /seed must be a non-negative integer/);
  assert.equal(listTakes(takes, "S012").length, 2);
});

test("take record update sets verdict and lip-sync figure", () => {
  const { prompt, takes } = base();
  writeTake(takes, input(prompt));
  updateTake(takes, "S012", 1, { verdict: "usable", lipsync_corr: "0.41", lipsync_lag_s: "0.04" });
  const r = readTake(takes, "S012", 1);
  assert.equal(r.verdict, "usable");
  assert.deepEqual(r.lipsync, { corr: 0.41, lag_s: 0.04 });
});

test("shot table lists every shot with verdict, takes, prompt and lip-sync", () => {
  const { prompt, takes } = base();
  writeTake(takes, input(prompt, { shot_id: "S001" }));
  writeTake(takes, input(prompt, { shot_id: "S001" }));
  updateTake(takes, "S001", 2, { verdict: "usable", lipsync_corr: 0.5, lipsync_lag_s: 0.03 });
  writeTake(takes, input(prompt, { shot_id: "S002", verdict: "redo" }));
  const scenes = [
    { id: "S001", in_ms: 0, out_ms: 4000, requires_lipsync: true, visual: { asset: "refs/s1.png" } },
    { id: "S002", in_ms: 4000, out_ms: 8000, visual: {} },
    { id: "S003", in_ms: 8000, out_ms: 12000, visual: {} },
  ];
  const takesBy = { S001: listTakes(takes, "S001"), S002: listTakes(takes, "S002") };
  const md = renderShotTable(buildShotRows({ takesBy, scenes }), { title: "T" });
  assert.match(md, /^# T/);
  assert.match(md, /Verdicts: missing 1, redo 1, usable 1 \(total 3 shots\)/);
  assert.match(md, /\| S001 \| 0\.00-4\.00 \| refs\/s1\.png \| 2 \|[^|]*\| usable \| corr 0\.5 at lag 0\.03 s \| 0\.80 \|/);
  assert.match(md, /\| S003 \| 8\.00-12\.00 \| - \| 0 \| - \| missing \| - \| - \|/);
});

const words = [
  { word: "Hello", start_ms: 1000, end_ms: 1400 },
  { word: "there,", start_ms: 1400, end_ms: 2100 },
  { word: "friend", start_ms: 3600500, end_ms: 3601250 },
];

test("srt and vtt use measured word times in the right formats", () => {
  assert.equal(formatSrtTime(3661001), "01:01:01,001");
  assert.equal(formatVttTime(3661001), "01:01:01.001");
  const cues = buildCues(words, ["Hello there,", "friend"]);
  assert.deepEqual(cues.map((c) => [c.start_ms, c.end_ms]), [[1000, 2100], [3600500, 3601250]]);
  assert.equal(toSrt(cues), "1\n00:00:01,000 --> 00:00:02,100\nHello there,\n\n2\n01:00:00,500 --> 01:00:01,250\nfriend\n");
  assert.equal(toVtt(cues), "WEBVTT\n\n00:00:01.000 --> 00:00:02.100\nHello there,\n\n01:00:00.500 --> 01:00:01.250\nfriend\n");
});

test("srt grouping fails loudly on a mismatch between lines and words", () => {
  assert.throws(() => buildCues(words, ["Hello world", "friend"]), /does not match/);
  assert.throws(() => buildCues(words, ["Hello there,"]), /not covered/);
  assert.throws(() => buildCues(words, ["Hello there, friend again"]), /past the end/);
});

test("music-video template manifest validates and fits the schema", () => {
  const m = JSON.parse(readFileSync(join(ROOT, "templates/music-video/manifest.json"), "utf8"));
  const res = validate(m);
  assert.deepEqual(res.errors, []);
  assert.equal(res.pass, true);
  assert.equal(m.mode, "music");
  assert.ok(m.scenes.length >= 3 && m.scenes.length <= 4);
  const schema = JSON.parse(readFileSync(join(ROOT, "skills/manifest/schema/manifest.schema.json"), "utf8"));
  for (const k of schema.required) assert.ok(k in m, `missing required ${k}`);
  for (const k of Object.keys(m)) assert.ok(k in schema.properties, `top-level key not in schema: ${k}`);
  assert.ok(schema.properties.mode.enum.includes(m.mode));
  const sceneSchema = schema.definitions.scene;
  for (const s of m.scenes) {
    for (const k of sceneSchema.required) assert.ok(k in s, `scene ${s.id} missing ${k}`);
    for (const k of Object.keys(s)) assert.ok(k in sceneSchema.properties, `scene key not in schema: ${k}`);
    assert.ok(sceneSchema.properties.visual.properties.source.enum.includes(s.visual.source));
  }
  assert.equal(m.scenes.at(-1).out_ms, m.audio_master_duration_ms);
  const p = JSON.parse(readFileSync(join(ROOT, "templates/music-video/project.json"), "utf8"));
  assert.equal(p.template, "music-video");
  assert.ok(existsSync(join(ROOT, "templates/music-video/README.md")));
});

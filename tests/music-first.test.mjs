import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validate } from "../scripts/validate-manifest.mjs";
import { cutFrames } from "../scripts/lib/manifest-lib.mjs";
import { buildMusicManifest } from "../scripts/music-manifest.mjs";

const goodMusic = () => ({
  version: "1",
  mode: "music",
  title: "music-test",
  format: ["16:9"],
  fps: 30,
  audio_master_path: "audio/song.m4a",
  audio_master_duration_ms: 12000,
  music: "audio/song.m4a",
  brand: { palette: ["#060b12", "#38bdf8"], music_volume: 1, music_duck_volume: 1 },
  rules: { through_line: false, graphic_per_sentence: false, min_shot_ms: 400 },
  scenes: [
    {
      id: "sh01",
      in_ms: 0,
      out_ms: 4000,
      duration_ms: 4000,
      camera_side: "S->N",
      eye_state: "E0",
      requires_lipsync: false,
      tts_script: "",
      captions: "none",
      visual: { source: "image", asset: "refs/scene-a.png", shot: { motion: "push" } },
    },
    {
      id: "sh02",
      in_ms: 4000,
      out_ms: 8333,
      duration_ms: 4333,
      camera_side: "N->S",
      eye_state: "E1",
      requires_lipsync: true,
      lyrics_line: "test line",
      tts_script: "",
      captions: "none",
      visual: { source: "image", asset: "refs/scene-b.png", shot: { motion: "pan" } },
    },
    {
      id: "sh03",
      in_ms: 8333,
      out_ms: 12000,
      duration_ms: 3667,
      camera_side: "S->N",
      eye_state: "E2",
      requires_lipsync: false,
      tech_test_placeholder: true,
      placeholder_label: "QA placeholder",
      tts_script: "",
      captions: "none",
      visual: { source: "placeholder" },
    },
  ],
});

const gatesOf = (m) => validate(m).errors.map((e) => e.gate);

test("music-first manifest passes all gates", () => {
  const res = validate(goodMusic());
  assert.deepEqual(res.errors, []);
  assert.equal(res.pass, true);
});

test("music-first negative controls: gaps, missing asset, synthetic tts, missing duration", () => {
  const missingDur = goodMusic();
  delete missingDur.audio_master_duration_ms;
  assert.ok(gatesOf(missingDur).includes("music"));

  const gap = goodMusic();
  gap.scenes[1].in_ms = 4100;
  assert.ok(gatesOf(gap).includes("music"));

  const synthTts = goodMusic();
  synthTts.scenes[0].tts_script = "Hidden narration";
  assert.ok(gatesOf(synthTts).includes("music"));

  const missingAsset = goodMusic();
  delete missingAsset.scenes[0].visual.asset;
  assert.ok(gatesOf(missingAsset).includes("music"));
});

test("cutFrames in music mode has zero cumulative rounding drift", () => {
  const m = goodMusic();
  const cuts = cutFrames(m);
  const last = cuts[cuts.length - 1];
  assert.equal(last.frame, Math.round((12000 / 1000) * 30));
  assert.equal(last.ms, 12000);
});

test("buildMusicManifest builds exact contiguous manifest from EDL and sections", () => {
  const dir = mkdtempSync(join(tmpdir(), "vf-music-"));
  writeFileSync(join(dir, "a.png"), "stub");
  writeFileSync(join(dir, "b.png"), "stub");
  const edl = {
    title: "track-probe",
    audio_master_path: "song.m4a",
    shots: [
      {
        shot_id: "s00",
        in_ms: 0,
        out_ms: 5769,
        video_or_image_source_path: "a.png",
        camera_side: "S->N",
        eye_state: "E0",
        requires_lipsync: false,
        motion: "push",
      },
      {
        shot_id: "s01",
        in_ms: 5769,
        out_ms: 10000,
        video_or_image_source_path: "b.png",
        camera_side: "N->S",
        eye_state: "E1",
        requires_lipsync: true,
        lyrics_line: "sample lyric line",
        motion: "pan",
      },
    ],
  };
  const sections = [
    { section_id: "intro", label: "Intro", in_ms: 0, out_ms: 5769 },
    { section_id: "verse1", label: "Verse 1", in_ms: 5769, out_ms: 10000 },
  ];
  const m = buildMusicManifest({
    edl,
    audioDurationMs: 10000,
    beats: { bpm: 104.06, confidence: 2.8, beats_ms: [0, 577, 1154], downbeats_ms: [0] },
    sections,
    baseDir: dir,
  });
  assert.equal(m.mode, "music");
  assert.equal(m.audio_master_duration_ms, 10000);
  assert.equal(m.scenes.length, 2);
  assert.equal(m.scenes[0].section_id, "intro");
  assert.equal(m.scenes[1].section_id, "verse1");
  assert.equal(validate(m).pass, true);
});

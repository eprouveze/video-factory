import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMinimaxRegenRequest,
  buildMinimaxRequest,
  checkPlaceholders,
  checkRefVideos,
  clampDuration,
  costUsd,
  imageSize,
  mapRatio,
  pickTask,
  queryUrl,
  resultUrl,
  taskError,
  taskState,
} from "../providers/clip/minimax.mjs";

test("registry defaults clip capability to minimax", () => {
  const registry = JSON.parse(
    readFileSync(new URL("../providers/providers.json", import.meta.url), "utf8"),
  );
  assert.equal(registry.capabilities.clip.default, "minimax");
  assert.equal(registry.capabilities.clip.adapters.minimax.est_usd, 0.08);
});

test("minimax builds a text-only request", () => {
  const { url, body } = buildMinimaxRequest({
    brief: "a red crane over a quiet lake",
    aspect: "9:16",
    duration_s: 6,
  });
  assert.equal(url, "https://api.minimax.io/v2/video_generation");
  assert.deepEqual(body, {
    model: "MiniMax-H3",
    content: [{ type: "text", text: "a red crane over a quiet lake" }],
    resolution: "768P",
    duration: 6,
    ratio: "9:16",
  });
});

test("minimax honours configured model and resolution", () => {
  const { body } = buildMinimaxRequest(
    { brief: "x", duration_s: 4 },
    { clip: { minimax_model: "MiniMax-H3-Max", minimax_resolution: "480P" } },
  );
  assert.equal(body.model, "MiniMax-H3-Max");
  assert.equal(body.resolution, "480P");
  assert.equal(body.duration, 5);
});

test("minimax sends the ref frame as a first_frame data URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-"));
  const ref = join(dir, "frame.jpg");
  writeFileSync(ref, Buffer.from([1, 2, 3]));
  const { body } = buildMinimaxRequest({ brief: "pan left", ref_frame: ref });
  assert.deepEqual(body.content, [
    { type: "text", text: "pan left" },
    {
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AQID" },
      role: "first_frame",
    },
  ]);
  assert.equal(body.ratio, "adaptive");
});

test("minimax supports first_frame + last_frame transitions", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-"));
  const first = join(dir, "first.png");
  const last = join(dir, "last.png");
  writeFileSync(first, Buffer.from([1, 2, 3]));
  writeFileSync(last, Buffer.from([4, 5, 6]));
  const { body } = buildMinimaxRequest({
    brief: "slow dolly transition",
    ref_frame: first,
    last_frame: last,
  });
  assert.deepEqual(body.content, [
    { type: "text", text: "slow dolly transition" },
    {
      type: "image_url",
      image_url: { url: "data:image/png;base64,AQID" },
      role: "first_frame",
    },
    {
      type: "image_url",
      image_url: { url: "data:image/png;base64,BAUG" },
      role: "last_frame",
    },
  ]);
  assert.equal(body.ratio, "adaptive");
});

test("minimax clamps duration to 4-15 s, default 8", () => {
  assert.equal(clampDuration(1), 4);
  assert.equal(clampDuration(99), 15);
  assert.equal(clampDuration(7.4), 7);
  assert.equal(clampDuration(undefined), 8);
  assert.equal(clampDuration("abc"), 8);
  assert.equal(clampDuration(4, "MiniMax-H3-Max"), 5);
});

test("minimax maps aspect to supported ratios", () => {
  for (const a of ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"])
    assert.equal(mapRatio(a), a);
  assert.equal(mapRatio(undefined), "16:9");
  assert.equal(mapRatio("5:4"), "16:9");
});

test("minimax task state for each status", () => {
  assert.equal(taskState({ status: "succeeded" }), "done");
  assert.equal(taskState({ status: "success" }), "done");
  assert.equal(taskState({ status: "failed" }), "failed");
  assert.equal(taskState({ status: "fail" }), "failed");
  assert.equal(taskState({ status: "cancelled" }), "failed");
  assert.equal(taskState({ status: "expired" }), "failed");
  assert.equal(taskState({ status: "queued" }), "pending");
  assert.equal(taskState({ status: "running" }), "pending");
  assert.equal(taskState(null), "pending");
});

test("minimax picks the task matching our id, not items[0]", () => {
  const ours = { id: "222", status: "succeeded", content: { url: "u://ours" } };
  const other = { id: "111", status: "failed" };
  const picked = pickTask({ items: [other, ours] }, "222");
  assert.equal(picked, ours);
  assert.equal(resultUrl(picked), "u://ours");
  assert.equal(pickTask({ items: [other] }, "222"), null);
  assert.equal(pickTask({ task: ours }, "222"), ours);
  assert.equal(pickTask({ task: other }, "222"), null);
});

test("minimax reports the API failure reason and builds the query url", () => {
  assert.equal(
    taskError({
      status: "failed",
      error: {
        code: "1026",
        message: "video description contains sensitive content",
      },
    }),
    "1026: video description contains sensitive content",
  );
  assert.equal(
    queryUrl("424010985738629"),
    "https://api.minimax.io/v2/query/video_generation/424010985738629",
  );
});

test("minimax cost comes from billed seconds and the price table", () => {
  const t = (model, resolution, total_seconds) => ({
    model,
    resolution,
    usage: { total_seconds },
  });
  assert.equal(costUsd(t("MiniMax-H3", "768P", 5)), 0.4);
  assert.equal(costUsd(t("MiniMax-H3", "2K", 5)), 0.65);
  assert.equal(costUsd(t("MiniMax-H3-Lite", "768P", 10)), 0.4);
  assert.equal(costUsd({ model: "MiniMax-H3", resolution: "768P" }), undefined);
  assert.equal(costUsd(t("Other", "768P", 5)), undefined);
});

function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

test("minimax gate: reference image aspect must be within [0.4, 2.5]", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-"));
  const ok = join(dir, "ok.png");
  const wide = join(dir, "wide.png");
  writeFileSync(ok, png(1024, 576));
  writeFileSync(wide, png(2610, 1000));
  assert.deepEqual(imageSize(png(1024, 576)), { w: 1024, h: 576 });
  const { body } = buildMinimaxRequest({ brief: "x", ref_images: [ok] });
  assert.equal(body.content[1].role, "reference_image");
  assert.equal(body.ratio, "adaptive");
  assert.throws(
    () => buildMinimaxRequest({ brief: "x", ref_images: [wide] }),
    /outside \[0.4, 2.5\]/,
  );
});

test("minimax gate: reference audio must be .wav", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-"));
  const wav = join(dir, "a.wav");
  const mp3 = join(dir, "a.mp3");
  writeFileSync(wav, Buffer.from([1]));
  writeFileSync(mp3, Buffer.from([1]));
  const { body } = buildMinimaxRequest({ brief: "x", ref_audio: [wav] });
  assert.equal(body.content[1].role, "reference_audio");
  assert.throws(
    () => buildMinimaxRequest({ brief: "x", ref_audio: [mp3] }),
    /must be \.wav/,
  );
});

test("minimax gate: first/last frame cannot mix with reference mode", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-"));
  const f = join(dir, "f.png");
  const w = join(dir, "a.wav");
  const v = join(dir, "m.mp4");
  writeFileSync(f, png(100, 100));
  writeFileSync(w, Buffer.from([1]));
  writeFileSync(v, Buffer.from([1, 2, 3]));
  assert.throws(
    () => buildMinimaxRequest({ brief: "x", ref_frame: f, ref_audio: [w] }),
    /choose one mode/,
  );
  assert.throws(
    () => buildMinimaxRequest({ brief: "x", last_frame: f, ref_videos: [v] }, { _probeDuration: () => 5 }),
    /choose one mode/,
  );
});

test("minimax gate: reference videos enforce format, count and duration limits", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-"));
  const v1 = join(dir, "v1.mp4");
  const v2 = join(dir, "v2.mov");
  const v3 = join(dir, "v3.mp4");
  const v4 = join(dir, "v4.mp4");
  const bad = join(dir, "bad.mkv");
  for (const p of [v1, v2, v3, v4, bad]) writeFileSync(p, Buffer.from([1, 2, 3]));

  const { body } = buildMinimaxRequest(
    { brief: "follow camera blueprint", ref_videos: [v1, v2] },
    { _probeDuration: () => 5 },
  );
  assert.equal(body.content[1].role, "reference_video");
  assert.equal(body.content[1].video_url.url, "data:video/mp4;base64,AQID");
  assert.equal(body.content[2].video_url.url, "data:video/quicktime;base64,AQID");
  assert.equal(body.ratio, "adaptive");

  assert.throws(
    () => checkRefVideos([v1, v2, v3, v4], () => 3),
    /at most 3 reference videos/,
  );
  assert.throws(
    () => checkRefVideos([bad], () => 5),
    /must be \.mp4 or \.mov/,
  );
  assert.throws(
    () => checkRefVideos([v1], () => 1.5),
    /must last 2 to 15 s/,
  );
  assert.throws(
    () => checkRefVideos([v1, v2], () => 9),
    /total 18\.00 s, limit is 15 s/,
  );
});

test("minimax gate: unfilled uppercase placeholders are refused before billing", () => {
  assert.doesNotThrow(() => checkPlaceholders("a steady shot of [a] quiet room"));
  assert.throws(
    () => buildMinimaxRequest({ brief: "Wide shot of [WORKERS] near [HERO_PROP]" }),
    /unfilled placeholder\(s\) \[HERO_PROP\], \[WORKERS\]/,
  );
});

test("minimax 768P -> 2K regeneration builds source_task_id and base_video requests", () => {
  const byTask = buildMinimaxRequest({ source_task_id: "424010985738629" });
  assert.equal(byTask.url, "https://api.minimax.io/v2/video_regeneration");
  assert.equal(byTask.regen, true);
  assert.deepEqual(byTask.body, {
    model: "MiniMax-H3",
    source_task_id: "424010985738629",
    resolution: "2K",
  });

  const dir = mkdtempSync(join(tmpdir(), "mm-"));
  const base = join(dir, "take768.mp4");
  const first = join(dir, "first.png");
  const last = join(dir, "last.png");
  writeFileSync(base, Buffer.from([7, 8, 9]));
  writeFileSync(first, Buffer.from([1, 2, 3]));
  writeFileSync(last, Buffer.from([4, 5, 6]));
  const byVideo = buildMinimaxRegenRequest({
    base_video: base,
    brief: "same shot in 2K",
    ref_frame: first,
    last_frame: last,
  });
  assert.equal(byVideo.url, "https://api.minimax.io/v2/video_regeneration");
  assert.equal(byVideo.body.resolution, "2K");
  assert.equal(byVideo.body.generate_audio, false);
  assert.deepEqual(
    byVideo.body.content.map((c) => c.role || c.type),
    ["text", "base_video", "first_frame", "last_frame"],
  );

  assert.throws(
    () => buildMinimaxRegenRequest({ source_task_id: "1", base_video: base, brief: "x" }),
    /exactly one of source_task_id or base_video/,
  );
  assert.throws(
    () => buildMinimaxRegenRequest({ base_video: base }),
    /requires brief/,
  );
  assert.throws(
    () => buildMinimaxRegenRequest({ base_video: base, brief: "fix [UNFILLED_SLOT]" }),
    /unfilled placeholder/,
  );
});

test("minimax reads a JPEG whose marker is preceded by 0xFF padding", () => {
  const pad = Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x40, 0x04, 0x00]);
  assert.deepEqual(imageSize(Buffer.concat([pad, Buffer.alloc(20)])), { w: 1024, h: 576 });
  const plain = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x40, 0x04, 0x00]);
  assert.deepEqual(imageSize(Buffer.concat([plain, Buffer.alloc(20)])), { w: 1024, h: 576 });
});

test("minimax H3-Lite reference requests use a concrete ratio, other models adaptive", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-"));
  const ref = join(dir, "r.png");
  writeFileSync(ref, png(1024, 576));
  const lite = buildMinimaxRequest(
    { brief: "x", aspect: "9:16", ref_images: [ref] },
    { clip: { minimax_model: "MiniMax-H3-Lite" } },
  );
  assert.equal(lite.body.ratio, "9:16");
  const std = buildMinimaxRequest({ brief: "x", aspect: "9:16", ref_images: [ref] });
  assert.equal(std.body.ratio, "adaptive");
});

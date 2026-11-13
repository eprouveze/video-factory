import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMinimaxRequest,
  clampDuration,
  costUsd,
  mapRatio,
  pickTask,
  queryUrl,
  resultUrl,
  taskError,
  taskState,
} from "../providers/clip/minimax.mjs";

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
  assert.equal(taskState({ status: "failed" }), "failed");
  assert.equal(taskState({ status: "cancelled" }), "failed");
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

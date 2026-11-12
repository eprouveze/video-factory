import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildImageRequest, findImage } from "../providers/image/gemini.mjs";
import {
  buildOmniRequest,
  clampDuration,
  fileIdFromUri,
  findVideo,
  interactionState,
} from "../providers/clip/omni.mjs";

test("gemini image builds the documented Interactions request", () => {
  const { url, body } = buildImageRequest({
    brief: "a red crane over a quiet lake",
    aspect: "9:16",
    out_path: "assets/crane.png",
  });
  assert.equal(
    url,
    "https://generativelanguage.googleapis.com/v1beta/interactions",
  );
  assert.deepEqual(body, {
    model: "gemini-3.1-flash-lite-image",
    input: "a red crane over a quiet lake",
    response_format: { type: "image", aspect_ratio: "9:16", image_size: "1K" },
  });
  assert.equal(
    buildImageRequest({ brief: "x" }, { image: { model: "image-override" } })
      .body.model,
    "image-override",
  );
});

test("gemini image reads image data from model_output steps", () => {
  const response = {
    steps: [
      { type: "thought", content: [{ type: "image", data: "dGhvdWdodA==" }] },
      {
        type: "model_output",
        content: [
          { type: "text", text: "done" },
          { type: "image", mime_type: "image/png", data: "aW1hZ2U=" },
        ],
      },
    ],
    id: "v1_test",
    status: "completed",
    model: "gemini-3.1-flash-lite-image",
    object: "interaction",
  };
  assert.equal(findImage(response), "aW1hZ2U=");
  assert.equal(findImage({ steps: [] }), null);
});

test("omni builds a synchronous 720p request and clamps duration", () => {
  const { url, body } = buildOmniRequest({
    brief: "one continuous shot",
    duration_s: 20,
  });
  assert.equal(
    url,
    "https://generativelanguage.googleapis.com/v1beta/interactions",
  );
  assert.deepEqual(body, {
    model: "gemini-omni-1.2-flash",
    input: "one continuous shot",
    response_format: {
      type: "video",
      aspect_ratio: "16:9",
      resolution: "720p",
      duration: "15s",
      delivery: "uri",
    },
    background: false,
    store: true,
    stream: false,
  });
  assert.equal(
    buildOmniRequest({ brief: "x", duration_s: 1 }).body.response_format
      .duration,
    "3s",
  );
  assert.equal(
    buildOmniRequest({ brief: "x" }).body.response_format.duration,
    "8s",
  );
  const custom = buildOmniRequest(
    { brief: "x", aspect: "9:16" },
    { clip: { omni_model: "omni-override", omni_resolution: "1080p" } },
  ).body;
  assert.equal(custom.model, "omni-override");
  assert.equal(custom.response_format.aspect_ratio, "9:16");
  assert.equal(custom.response_format.resolution, "1080p");
});

test("omni sends ref_frame as base64 image input", () => {
  const dir = mkdtempSync(join(tmpdir(), "vf-omni-test-"));
  const frame = join(dir, "frame.jpg");
  writeFileSync(frame, "frame");
  const { body } = buildOmniRequest({
    brief: "animate this",
    ref_frame: frame,
  });
  assert.deepEqual(body.input, [
    { type: "image", data: "ZnJhbWU=", mime_type: "image/jpeg" },
    { type: "text", text: "animate this" },
  ]);
});

test("omni reads REST video output and file id", () => {
  const response = {
    steps: [
      { type: "user_input", content: [{ type: "text", text: "..." }] },
      {
        type: "model_output",
        content: [
          {
            type: "video",
            mime_type: "video/mp4",
            uri: "https://generativelanguage.googleapis.com/v1beta/files/abc-123:download?alt=media",
          },
        ],
      },
    ],
    id: "v1_test",
    status: "completed",
    model: "gemini-omni-1.2-flash",
    object: "interaction",
  };
  const video = findVideo(response);
  assert.equal(video.mime_type, "video/mp4");
  assert.equal(fileIdFromUri(video.uri), "abc-123");
  assert.equal(findVideo({ steps: [] }), null);
  assert.equal(
    findVideo({
      steps: [
        {
          type: "model_output",
          content: [{ type: "video", data: "dmlkZW8=" }],
        },
      ],
    }).data,
    "dmlkZW8=",
  );
});

test("registry defaults to omni and veo fails fast without network", () => {
  const registry = JSON.parse(
    readFileSync(
      new URL("../providers/providers.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(registry.capabilities.clip.default, "omni");
  assert.equal(registry.capabilities.clip.adapters.omni.est_usd, 0.07);
  assert.equal(
    registry.capabilities.image.adapters["gemini-imagen"].est_usd,
    0.0336,
  );
  assert.equal(registry.capabilities.clip.adapters.veo.est_usd, undefined);
  const result = spawnSync(process.execPath, ["providers/clip/veo.mjs"], {
    cwd: new URL("..", import.meta.url),
    input: "{}",
    encoding: "utf8",
    env: { ...process.env, GEMINI_API_KEY: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /shut down on 2026-10-22/);
  assert.match(result.stderr, /`omni`/);
});

test("omni: job state, duration clamp and the old resolution key", () => {
  assert.equal(interactionState({ status: "completed" }), "done");
  assert.equal(
    interactionState({ status: "in_progress", id: "i1" }),
    "pending",
  );
  assert.equal(interactionState({ id: "i1" }), "pending");
  assert.equal(interactionState({ status: "failed" }), "failed");
  assert.equal(interactionState({ status: "cancelled" }), "failed");
  assert.equal(interactionState({ error: { message: "x" } }), "failed");
  assert.equal(clampDuration(1), 3);
  assert.equal(clampDuration(40), 15);
  assert.equal(clampDuration(undefined), 8);
  assert.equal(clampDuration(6.4), 6);
  const old = buildOmniRequest(
    { brief: "b", aspect: "1:1", out_path: "o.mp4" },
    {
      clip: {
        veo_resolution: "1080p",
        veo_model: "veo-3.1-fast-generate-preview",
      },
    },
  );
  assert.equal(old.body.response_format.resolution, "1080p");
  assert.equal(old.body.response_format.aspect_ratio, "16:9");
  assert.equal(old.body.model, "gemini-omni-1.2-flash");
  const both = buildOmniRequest(
    { brief: "b", out_path: "o.mp4" },
    { clip: { veo_resolution: "1080p", omni_resolution: "4K" } },
  );
  assert.equal(both.body.response_format.resolution, "4K");
});

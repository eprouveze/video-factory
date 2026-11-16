import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildOpenRouterVideoRequest,
  clampDuration,
  downloadHeaders,
  enforceCostGuard,
  estimateCostDetail,
  estimateCostUsd,
  redactRequestForLog,
  videoError,
  videoResultUrl,
  videoState,
} from "../providers/clip/openrouter.mjs";
import {
  DEFAULT_VISUAL_CHECKS,
  evaluateClipAcceptance,
  parseFrameRate,
} from "../scripts/accept-clip.mjs";

test("openrouter builds 4s alibaba/wan-2.7 audio-conditioned payload under atlas-cloud", () => {
  const dir = mkdtempSync(join(tmpdir(), "or-clip-"));
  const ref = join(dir, "plate-16x9.png");
  const wav = join(dir, "vocal-4s.wav");
  writeFileSync(ref, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  writeFileSync(wav, Buffer.from("RIFF0000WAVEfmt "));

  const built = buildOpenRouterVideoRequest({
    brief: "A singer performs a dry close-up facing the camera",
    aspect: "16:9",
    duration_s: 4,
    resolution: "720p",
    ref_frame: ref,
    audio_path: wav,
    negative_prompt: "glowing eyes, shifted props",
    dry_run: true,
    max_cost_usd: 0.5,
  });

  assert.equal(built.url, "https://openrouter.ai/api/v1/videos");
  assert.equal(built.model, "alibaba/wan-2.7");
  assert.equal(built.providerSlug, "atlas-cloud");
  assert.equal(built.estCostUsd, 0.4);
  assert.equal(built.body.duration, 4);
  assert.equal(built.body.aspect_ratio, "16:9");
  assert.equal(built.body.resolution, "720p");
  assert.equal(built.body.generate_audio, false);
  assert.deepEqual(built.body.frame_images, [
    {
      type: "image_url",
      image_url: { url: "data:image/png;base64,iVBORw0KGgo=" },
      frame_type: "first_frame",
    },
  ]);
  assert.deepEqual(built.body.provider, {
    order: ["atlas-cloud"],
    options: {
      "atlas-cloud": {
        audio: "<HTTPS_URL_FOR:vocal-4s.wav>",
        negative_prompt: "glowing eyes, shifted props",
      },
    },
  });
  assert.ok(built.refHashes.first_frame.sha256);
  assert.ok(built.refHashes.audio.sha256);
});

test("openrouter sends literal https audio_url for live build without failing", () => {
  const built = buildOpenRouterVideoRequest({
    brief: "A singer performs a 4s test",
    ref_frame: "https://example.com/ref-closeup.png",
    audio_url: "https://example.com/clip-4s.mp3",
    duration_s: 4,
    dry_run: false,
  });
  assert.equal(
    built.body.provider.options["atlas-cloud"].audio,
    "https://example.com/clip-4s.mp3",
  );
  assert.equal(built.body.generate_audio, false);
});

test("openrouter rejects live audio_path without https audio_url unless opted in", () => {
  const dir = mkdtempSync(join(tmpdir(), "or-clip-"));
  const wav = join(dir, "vocal-4s.wav");
  writeFileSync(wav, Buffer.from("RIFF0000WAVEfmt "));

  assert.throws(
    () =>
      buildOpenRouterVideoRequest({
        brief: "A singer performs",
        audio_path: wav,
        dry_run: false,
      }),
    /HTTPS audio_url/,
  );

  const allowed = buildOpenRouterVideoRequest({
    brief: "A singer performs",
    audio_path: wav,
    dry_run: false,
    allow_audio_data_uri: true,
  });
  assert.match(
    allowed.body.provider.options["atlas-cloud"].audio,
    /^data:audio\/wav;base64,/,
  );
});

test("openrouter rejects audio conditioning on models without audio passthrough", () => {
  for (const model of ["bytedance/seedance-2.5", "minimax/hailuo-3-max", "google/gemini-omni-1.2-flash"]) {
    assert.throws(
      () =>
        buildOpenRouterVideoRequest({
          model,
          brief: "A singer performs",
          audio_url: "https://example.com/slice.mp3",
          dry_run: true,
        }),
      /does not advertise external audio passthrough/,
    );
  }
});

test("openrouter enforces duration clamps and cost guard", () => {
  assert.equal(clampDuration(1, "alibaba/wan-2.7"), 2);
  assert.equal(clampDuration(4, "alibaba/wan-2.7"), 4);
  assert.equal(clampDuration(99, "alibaba/wan-2.7"), 10);
  assert.equal(clampDuration(4, "alibaba/wan-2.6"), 5);
  assert.equal(clampDuration(8, "alibaba/wan-2.6"), 10);

  assert.equal(estimateCostUsd("alibaba/wan-2.7", 4), 0.4);
  assert.equal(estimateCostUsd("google/gemini-omni-1.2-flash", 5), 0.3475);
  assert.equal(estimateCostUsd("bytedance/seedance-2.5", 5), null);

  assert.doesNotThrow(() => enforceCostGuard(0.4, 0.5));
  assert.throws(() => enforceCostGuard(0.4, 0.35), /exceeds max_cost_usd/);
  assert.throws(() => enforceCostGuard(null, 0.5), /unpriced/);
});

test("openrouter CLI --dry-run writes redacted provenance with zero network and no secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "or-dry-"));
  const ref = join(dir, "frame.png");
  const wav = join(dir, "audio.wav");
  const outClip = join(dir, "clip.mp4");
  writeFileSync(ref, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  writeFileSync(wav, Buffer.from("RIFF0000WAVEfmt "));

  const stdout = execFileSync(
    "node",
    [resolve("providers/clip/openrouter.mjs"), "--dry-run"],
    {
      input: JSON.stringify({
        brief: "Close-up singing plate",
        duration_s: 4,
        aspect: "16:9",
        resolution: "720p",
        ref_frame: ref,
        audio_path: wav,
        max_cost_usd: 0.5,
        out_path: outClip,
      }),
      env: { ...process.env, OPENROUTER_API_KEY: "sk-or-test-secret-should-not-leak" },
      encoding: "utf8",
    },
  );
  const res = JSON.parse(stdout);
  assert.equal(res.dry_run, true);
  assert.equal(res.model, "alibaba/wan-2.7");
  assert.equal(res.est_cost_usd, 0.4);
  assert.match(res.request_body.frame_images[0].image_url.url, /^<DATA_URI:image\/png;bytes=/);
  const provRaw = readFileSync(res.provenance_path, "utf8");
  assert.ok(!provRaw.includes("sk-or-test-secret-should-not-leak"));

  const red = redactRequestForLog({ url: "data:image/png;base64,iVBORw0KGgo=" });
  assert.match(red.url, /^<DATA_URI:image\/png;bytes=8;sha256=/);
});

test("openrouter poll helpers classify completed, pending, failed and errors", () => {
  assert.equal(videoState({ status: "completed" }), "done");
  assert.equal(videoState({ status: "failed" }), "failed");
  assert.equal(videoState({ status: "cancelled" }), "failed");
  assert.equal(videoState({ status: "pending" }), "pending");
  assert.equal(
    videoResultUrl({ unsigned_urls: ["https://openrouter.ai/api/v1/videos/1/content"] }),
    "https://openrouter.ai/api/v1/videos/1/content",
  );
  assert.equal(
    videoError({ error: { code: "bad_audio", message: "invalid audio URL" } }),
    "bad_audio: invalid audio URL",
  );
});

test("accept-clip verifies 30fps 1-frame tolerance, 16:9 aspect, audio preservation, and provenance", () => {
  assert.equal(parseFrameRate("30/1"), 30);
  assert.equal(Math.round(parseFrameRate("30000/1001") * 100) / 100, 29.97);

  const ok = evaluateClipAcceptance({
    probe: {
      format: { duration: "4.000000" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1280, height: 720, avg_frame_rate: "30/1", duration: "4.000000" },
        { codec_type: "audio", codec_name: "aac", duration: "4.000000" },
      ],
    },
    refAudioProbe: {
      format: { duration: "4.000000" },
      streams: [{ codec_type: "audio", duration: "4.000000" }],
    },
    provenance: {
      model: "alibaba/wan-2.7",
      request_redacted: { prompt: "A singer performs" },
      refs: { first_frame: { sha256: "abc123" } },
      cost_usd: 0.4,
    },
    expect: { durationS: 4, fps: 30, aspect: "16:9", strictFps: true },
  });
  assert.equal(ok.mechanical_pass, true);
  assert.equal(ok.visual_qa_status, "PENDING_HUMAN_VISUAL_REVIEW");
  assert.deepEqual(ok.visual_checks_required, DEFAULT_VISUAL_CHECKS);
  const custom = evaluateClipAcceptance({
    probe: { streams: [{ codec_type: "video", width: 1280, height: 720, avg_frame_rate: "30/1", duration: "4.000000" }] },
    expect: { durationS: 4, fps: 30, aspect: "16:9", audioMode: "any", checks: ["a", "b"] },
  });
  assert.deepEqual(custom.visual_checks_required, ["a", "b"]);

  // AAC priming: 40 ms audio offset (> 1 frame at 30fps) must still pass
  const primed = evaluateClipAcceptance({
    probe: { streams: [
      { codec_type: "video", width: 1280, height: 720, avg_frame_rate: "30/1", duration: "4.000000" },
      { codec_type: "audio", duration: "4.040000" } ] },
    refAudioProbe: { streams: [{ codec_type: "audio", duration: "4.000000" }] },
    expect: { durationS: 4, fps: 30, aspect: "16:9", audioMode: "preserved" },
  });
  assert.equal(primed.checks.find((c) => c.name === "original_audio_preserved").pass, true);

  const badDurAndAspect = evaluateClipAcceptance({
    probe: {
      format: { duration: "4.100000" },
      streams: [
        { codec_type: "video", width: 720, height: 960, avg_frame_rate: "30/1", duration: "4.100000" },
      ],
    },
    expect: { durationS: 4, fps: 30, aspect: "16:9", audioMode: "silent" },
  });
  assert.equal(badDurAndAspect.mechanical_pass, false);
  assert.equal(badDurAndAspect.failures.length, 2);

  const badAudioLeak = evaluateClipAcceptance({
    probe: {
      streams: [
        { codec_type: "video", width: 1280, height: 720, avg_frame_rate: "30/1", duration: "4.000000" },
        { codec_type: "audio", duration: "4.000000" },
      ],
    },
    expect: { durationS: 4, fps: 30, aspect: "16:9", audioMode: "silent" },
  });
  assert.equal(badAudioLeak.mechanical_pass, false);
  assert.match(badAudioLeak.failures[0], /expected silent I2V clip/);
});

test("cost estimate never under-counts an unpriced resolution", () => {
  const d = estimateCostDetail("alibaba/wan-2.7", 4, { resolution: "4k" });
  assert.equal(d.approximate, true);
  assert.equal(d.usd, 0.4);
  assert.equal(estimateCostDetail("alibaba/wan-2.7", 4).approximate, false);
  // wan-2.6 has distinct per-resolution prices: unknown res uses the highest
  const hi = estimateCostDetail("alibaba/wan-2.6", 5, { resolution: "4k" });
  assert.ok(hi.usd >= estimateCostUsd("alibaba/wan-2.6", 5, { resolution: "720p" }));
});

test("generate_audio defaults to false unless explicitly requested", () => {
  const base = { brief: "A singer performs", dry_run: true };
  assert.equal(buildOpenRouterVideoRequest(base).body.generate_audio, false);
  assert.equal(
    buildOpenRouterVideoRequest({ ...base, generate_audio: true }).body.generate_audio,
    true,
  );
});

test("download auth header only goes to openrouter.ai hosts", () => {
  assert.deepEqual(downloadHeaders("https://openrouter.ai/api/v1/videos/1/content", "k"), { Authorization: "Bearer k" });
  assert.deepEqual(downloadHeaders("https://cdn.openrouter.ai/x.mp4", "k"), { Authorization: "Bearer k" });
  assert.deepEqual(downloadHeaders("https://evil.example.com/x.mp4", "k"), {});
  assert.deepEqual(downloadHeaders("https://openrouter.ai.evil.com/x.mp4", "k"), {});
  assert.deepEqual(downloadHeaders("not a url", "k"), {});
});

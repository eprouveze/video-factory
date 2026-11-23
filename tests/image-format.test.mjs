// Regression tests for the two defects the 2026-11-23 bake-off found:
//   1. a provider returning JPEG bytes that were written to a .png path
//   2. a 16:9 request silently served at 3:2
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sniffImageMime,
  extensionForMime,
  pathMatchingMime,
} from "../providers/image/lib/format.mjs";
import { loadRefs as geminiLoadRefs } from "../providers/image/gemini.mjs";
import {
  loadRefs as openaiLoadRefs,
  NATIVE_ASPECTS,
  buildImageRequest,
} from "../providers/image/gpt-image.mjs";
import { validate } from "../scripts/validate-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("JFIF-fake-body-for-magic-bytes"),
]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBPVP8 "),
  Buffer.from([0, 0, 0, 0]),
]);

test("sniffImageMime reads magic bytes, not extensions", () => {
  assert.equal(sniffImageMime(PNG), "image/png");
  assert.equal(sniffImageMime(JPEG), "image/jpeg");
  assert.equal(sniffImageMime(WEBP), "image/webp");
  assert.equal(sniffImageMime(Buffer.from("not an image at all")), null);
});

test("pathMatchingMime corrects a lying extension without touching a truthful one", () => {
  assert.equal(pathMatchingMime("/a/frame.png", "image/jpeg"), "/a/frame.jpg");
  assert.equal(pathMatchingMime("/a/frame.png", "image/png"), "/a/frame.png");
  assert.equal(
    pathMatchingMime("/a/frame.jpeg", "image/jpeg"),
    "/a/frame.jpeg",
  );
  assert.equal(extensionForMime("image/webp"), ".webp");
});

test("a JPEG saved as .png is sent as image/jpeg by BOTH adapters (the bake-off bug)", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgfmt-"));
  const liar = join(dir, "frame.png");
  writeFileSync(liar, JPEG); // exactly what nano-banana-pro produced on 2026-11-23

  for (const [name, loadRefs] of [
    ["gemini", geminiLoadRefs],
    ["gpt-image", openaiLoadRefs],
  ]) {
    const refs = loadRefs([liar]);
    assert.equal(
      refs[0].mime ?? refs[0].mime_type,
      "image/jpeg",
      `${name} must not trust the .png extension`,
    );
  }
});

test("a genuine PNG reference is still sent as image/png", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgfmt-"));
  const real = join(dir, "real.png");
  writeFileSync(real, PNG);
  assert.equal(geminiLoadRefs([real])[0].mime_type, "image/png");
  assert.equal(openaiLoadRefs([real])[0].mime, "image/png");
});

test("gpt-image has no native 16:9 and says so in the built request", () => {
  assert.ok(!NATIVE_ASPECTS.includes("16:9"));
  assert.ok(NATIVE_ASPECTS.includes("3:2"));
  const built = buildImageRequest({ brief: "x", aspect: "16:9" }, {});
  assert.equal(built.size, "1536x1024", "16:9 is served at 3:2");
});

test("the registry declares native_aspects so the validator can reason about crops", () => {
  const reg = JSON.parse(
    readFileSync(join(ROOT, "providers/providers.json"), "utf8"),
  );
  const img = reg.capabilities.image.adapters;
  assert.ok(!img["gpt-image"].native_aspects.includes("16:9"));
  assert.ok(img["nano-banana-pro"].native_aspects.includes("16:9"));
  assert.ok(img["gemini-imagen"].native_aspects.includes("16:9"));
});

test("validator warns on a 16:9 scene routed to an adapter that cannot produce it", () => {
  const manifest = {
    version: "1",
    title: "t",
    format: ["16:9"],
    fps: 30,
    scenes: [
      { id: "s1", visual: { visual_brief: "a boot", source: "generated" } },
    ],
  };
  const mk = (provider) => ({
    capabilities: {
      image: {
        default: provider,
        adapters: {
          "gpt-image": {
            tier: "plugin",
            native_aspects: ["3:2", "2:3", "1:1"],
          },
          "nano-banana-pro": {
            tier: "plugin",
            native_aspects: ["16:9", "9:16", "1:1"],
          },
        },
      },
    },
  });

  const warned = validate(manifest, { registry: mk("gpt-image") });
  const aspect = warned.warnings.filter((w) => w.gate === "aspect");
  assert.equal(aspect.length, 1, "one warning per offending format");
  assert.match(aspect[0].message, /cannot produce 16:9/);

  const clean = validate(manifest, { registry: mk("nano-banana-pro") });
  assert.equal(
    clean.warnings.filter((w) => w.gate === "aspect").length,
    0,
    "no warning when the provider can produce the format",
  );
});

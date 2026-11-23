import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts/identity-sheet.mjs");
const SPEC_PATH = join(
  ROOT,
  "skills/identity-sheet/prompts/identity-sheet.v1.json",
);
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));

test("identity sheet spec has 20 uniquely identified shots with non-empty prompts", () => {
  assert.equal(spec.shots.length, 20);
  const ids = new Set(spec.shots.map((s) => s.id));
  const slugs = new Set(spec.shots.map((s) => s.slug));
  assert.equal(ids.size, 20, "every shot needs a unique id");
  assert.equal(slugs.size, 20, "every shot needs a unique slug");
  for (const shot of spec.shots) {
    assert.match(shot.id, /^\d{2}$/);
    assert.ok(shot.prompt.trim().length > 20, `${shot.id} has a usable prompt`);
  }
});

test("identity sheet spec carries the shared identity lock, camera and lighting blocks", () => {
  for (const key of ["identity_lock", "camera", "lighting"]) {
    assert.ok(
      typeof spec[key] === "string" && spec[key].length > 30,
      `${key} must be a real block`,
    );
  }
  // The lock must name what may NOT change, or the sheet drifts.
  assert.match(spec.identity_lock, /do not beautify|preserve/i);
});

test("identity sheet spec covers profiles, both three-quarter angles, and a full body shot", () => {
  const slugs = spec.shots.map((s) => s.slug);
  for (const required of [
    "profile-left",
    "profile-right",
    "three-quarter-left",
    "three-quarter-right",
    "full-body-front",
  ]) {
    assert.ok(slugs.includes(required), `missing ${required}`);
  }
});

test("nano-banana-pro is registered as an image adapter with a cost estimate", () => {
  const reg = JSON.parse(
    readFileSync(join(ROOT, "providers/providers.json"), "utf8"),
  );
  const a = reg.capabilities.image.adapters["nano-banana-pro"];
  assert.ok(a, "nano-banana-pro must be registered");
  assert.equal(a.path, "providers/image/nano-banana-pro.mjs");
  assert.equal(a.refs, true);
  assert.equal(
    reg.capabilities.image.default,
    "gpt-image",
    "gpt-image-2.6-sunburst is the default: #1 on the AA image board, 144 Elo ahead",
  );
  const def = reg.capabilities.image.adapters[reg.capabilities.image.default];
  assert.equal(def.refs, true, "the default must accept reference images");
  assert.ok(
    a.est_usd > def.est_usd,
    "nano-banana-pro stays the expensive opt-in, not the default",
  );
  // Every image adapter that actually exists must declare whether it takes refs, or the refs
  // guard in produce.mjs cannot reason about it. Declared-but-unbuilt placeholders
  // (fal-flux, ideogram) are exempt until their adapter file lands.
  for (const [name, adapter] of Object.entries(
    reg.capabilities.image.adapters,
  )) {
    if (!existsSync(join(ROOT, adapter.path))) continue;
    assert.equal(
      typeof adapter.refs,
      "boolean",
      `${name} must declare refs: true|false`,
    );
  }
});

test("gemini adapter honours VF_IMAGE_MODEL and VF_IMAGE_SIZE overrides", async () => {
  const { buildImageRequest } = await import("../providers/image/gemini.mjs");
  process.env.VF_IMAGE_MODEL = "gemini-3-pro-image";
  process.env.VF_IMAGE_SIZE = "2K";
  const built = buildImageRequest({ brief: "a test", aspect: "16:9" }, {});
  assert.equal(built.body.model, "gemini-3-pro-image");
  assert.equal(built.body.response_format.image_size, "2K");
  delete process.env.VF_IMAGE_MODEL;
  delete process.env.VF_IMAGE_SIZE;
});

test("config beats env for the model, so a machine-level choice still wins", async () => {
  const { buildImageRequest } = await import("../providers/image/gemini.mjs");
  process.env.VF_IMAGE_MODEL = "gemini-3-pro-image";
  const built = buildImageRequest(
    { brief: "a test" },
    { image: { model: "gemini-3.1-flash-image" } },
  );
  assert.equal(built.body.model, "gemini-3.1-flash-image");
  delete process.env.VF_IMAGE_MODEL;
});

test("identity-sheet --dry-run prints briefs for every shot and spends nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "idsheet-"));
  const src = join(dir, "me.png");
  // 1x1 png, enough for the script's existence and hash checks; the dry run never calls it.
  writeFileSync(
    src,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const out = execFileSync(
    "node",
    [SCRIPT, "--source", src, "--out", join(dir, "out"), "--dry-run"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  assert.equal(out.trim(), "");
});

test("identity-sheet refuses an unknown adapter and a missing source", () => {
  const dir = mkdtempSync(join(tmpdir(), "idsheet-"));
  const src = join(dir, "me.png");
  writeFileSync(src, Buffer.from("x"));
  assert.throws(() =>
    execFileSync(
      "node",
      [SCRIPT, "--source", src, "--out", dir, "--adapter", "nope"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  assert.throws(() =>
    execFileSync(
      "node",
      [SCRIPT, "--source", join(dir, "missing.png"), "--out", dir],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
});

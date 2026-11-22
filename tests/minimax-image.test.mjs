import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_REFS,
  buildMinimaxImageRequest,
  extractImage,
  imageCostUsd,
} from "../providers/image/minimax.mjs";

test("minimax image without refs calls /v1/images/generations", () => {
  const built = buildMinimaxImageRequest({
    brief: "wet asphalt courtyard under warm tungsten streetlamps",
    aspect: "16:9",
  });
  assert.equal(built.url, "https://api.minimax.io/v1/images/generations");
  assert.equal(built.refs_used, 0);
  assert.deepEqual(built.body, {
    model: "MiniMax-H3-Image",
    prompt: "wet asphalt courtyard under warm tungsten streetlamps",
    aspect_ratio: "16:9",
    area: "2K",
    response_format: "url",
    n: 1,
  });
});

test("minimax image with refs calls /v1/images/edits with data URIs", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-img-"));
  const r1 = join(dir, "char.png");
  const r2 = join(dir, "look.jpg");
  writeFileSync(r1, Buffer.from([1, 2, 3]));
  writeFileSync(r2, Buffer.from([4, 5, 6]));

  const built = buildMinimaxImageRequest(
    { brief: "medium close-up matching identity", aspect: "9:16", refs: [r1, r2], area: "4K" },
    { image: { minimax_model: "MiniMax-H3-Image-Highspeed" } },
  );
  assert.equal(built.url, "https://api.minimax.io/v1/images/edits");
  assert.equal(built.refs_used, 2);
  assert.equal(built.body.model, "MiniMax-H3-Image-Highspeed");
  assert.equal(built.body.area, "4K");
  assert.equal(built.body.aspect_ratio, "9:16");
  assert.deepEqual(built.body.images, [
    { image_url: "data:image/png;base64,AQID" },
    { image_url: "data:image/jpeg;base64,BAUG" },
  ]);
});

test("minimax image refuses missing, unsupported, excessive refs and placeholders", () => {
  const dir = mkdtempSync(join(tmpdir(), "mm-img-"));
  const bad = join(dir, "ref.gif");
  const ok = join(dir, "ref.png");
  writeFileSync(bad, Buffer.from([1]));
  writeFileSync(ok, Buffer.from([1]));

  assert.throws(
    () => buildMinimaxImageRequest({ brief: "x", refs: [join(dir, "missing.png")] }),
    /file not found/,
  );
  assert.throws(
    () => buildMinimaxImageRequest({ brief: "x", refs: [bad] }),
    /\.png, \.jpg or \.webp/,
  );
  assert.throws(
    () =>
      buildMinimaxImageRequest({
        brief: "x",
        refs: Array.from({ length: MAX_REFS + 1 }, () => ok),
      }),
    /accepts 14/,
  );
  assert.throws(
    () => buildMinimaxImageRequest({ brief: "portrait of [PROTAGONIST]" }),
    /unfilled placeholder\(s\) \[PROTAGONIST\]/,
  );
});

test("minimax image extracts url or b64_json and computes token cost", () => {
  assert.deepEqual(extractImage({ data: [{ url: "https://cdn.example/out.jpg" }] }), {
    url: "https://cdn.example/out.jpg",
  });
  assert.deepEqual(extractImage({ data: [{ b64_json: "AQID" }] }), {
    b64_json: "AQID",
  });
  assert.equal(extractImage({ data: [] }), null);

  // Real 2K two-reference edit usage sample: 5098 text in, 5726 image in, 4080 image out
  const usage = {
    input_tokens: 10824,
    output_tokens: 4080,
    input_tokens_details: { text_tokens: 5098, image_tokens: 5726 },
    output_tokens_details: { image_tokens: 4080 },
  };
  assert.equal(imageCostUsd(usage, "MiniMax-H3-Image"), 0.035818);
  assert.equal(imageCostUsd(usage, "MiniMax-H3-Image-Highspeed"), 0.059911);
  assert.equal(imageCostUsd(null, "MiniMax-H3-Image"), undefined);
});

test("registry registers minimax image adapter with refs and sourced estimate", () => {
  const registry = JSON.parse(
    readFileSync(new URL("../providers/providers.json", import.meta.url), "utf8"),
  );
  const entry = registry.capabilities.image.adapters.minimax;
  assert.equal(entry.path, "providers/image/minimax.mjs");
  assert.equal(entry.refs, true);
  assert.equal(entry.est_usd, 0.04);
  assert.match(entry.est_source, /^https:\/\/platform\.minimax\.io\//);
});

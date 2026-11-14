import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildImageRequest, MAX_REFS } from "../providers/image/gpt-image.mjs";
import { imageRefs } from "../scripts/lib/manifest-lib.mjs";

test("gpt-image without refs calls generations with JSON", () => {
  const r = buildImageRequest({ brief: "a lake", aspect: "9:16" });
  assert.match(r.url, /\/v1\/images\/generations$/);
  assert.equal(r.refs_used, 0);
  assert.deepEqual(JSON.parse(r.body), {
    model: "gpt-image-2.6-sunburst",
    prompt: "a lake",
    size: "1024x1536",
    n: 1,
  });
});

test("gpt-image with refs calls edits with one image[] part per reference", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vf-refs-"));
  const a = join(dir, "face.png");
  const b = join(dir, "room.jpg");
  writeFileSync(a, Buffer.from("AAA"));
  writeFileSync(b, Buffer.from("BBBB"));
  const r = buildImageRequest({
    brief: "same person at the desk",
    refs: [a, b],
  });
  assert.match(r.url, /\/v1\/images\/edits$/);
  assert.equal(r.refs_used, 2);
  assert.equal(r.headers["Content-Type"], undefined);
  assert.equal(r.body.get("prompt"), "same person at the desk");
  assert.equal(r.body.get("size"), "1536x1024");
  const parts = r.body.getAll("image[]");
  assert.deepEqual(
    parts.map((p) => [p.name, p.type, p.size]),
    [
      ["face.png", "image/png", 3],
      ["room.jpg", "image/jpeg", 4],
    ],
  );
  assert.equal(await parts[0].text(), "AAA");
});

test("gpt-image refuses a missing, unsupported or excessive reference", () => {
  const dir = mkdtempSync(join(tmpdir(), "vf-refs-"));
  assert.throws(
    () => buildImageRequest({ brief: "x", refs: [join(dir, "no.png")] }),
    /not found/,
  );
  assert.throws(
    () => buildImageRequest({ brief: "x", refs: [join(dir, "a.gif")] }),
    /png, .jpg or .webp/,
  );
  const many = Array.from({ length: MAX_REFS + 1 }, (_, i) =>
    join(dir, `${i}.png`),
  );
  assert.throws(
    () => buildImageRequest({ brief: "x", refs: many }),
    /accepts 16/,
  );
});

test("imageRefs orders continuity before look and says what each is for", () => {
  const scene = { continuity_refs: ["refs/face.png", "refs/room.png"] };
  const brand = { look_ref: "refs/look.png" };
  const r = imageRefs(scene, brand, "/proj");
  assert.deepEqual(r.refs, [
    "/proj/refs/face.png",
    "/proj/refs/room.png",
    "/proj/refs/look.png",
  ]);
  assert.match(
    r.note,
    /Reference images 1 to 2 show the established character/,
  );
  assert.match(
    r.note,
    /Reference image 3 is a colour and texture reference only/,
  );

  const lookOnly = imageRefs(scene, brand, "/proj", { continuity: false });
  assert.deepEqual(lookOnly.refs, ["/proj/refs/look.png"]);
  assert.match(lookOnly.note, /Reference image 1 is a colour and texture/);

  assert.deepEqual(imageRefs({}, {}, "/proj"), { refs: undefined, note: "" });
});

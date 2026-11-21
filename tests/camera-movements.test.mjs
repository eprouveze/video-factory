import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMoves,
  listMoves,
  getMove,
  formatCameraBlock,
  buildClipPrompt,
  DEFAULT_REF_LOCK_NOTE,
  NO_TEXT_GUARD,
} from "../scripts/lib/camera-moves.mjs";
import { validate } from "../scripts/validate-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(ROOT, "scripts/camera-move.mjs");

test("all 46 camera movements load with unique ids, slugs, and expected category counts", () => {
  const moves = loadMoves();
  assert.equal(moves.length, 46);

  const ids = new Set(moves.map((m) => m.id));
  const slugs = new Set(moves.map((m) => m.slug));
  assert.equal(ids.size, 46, "every move must have a unique id");
  assert.equal(slugs.size, 46, "every move must have a unique slug");

  const expectedIds = [
    "01", "02", "02B", "03", "03B", "04", "04B",
    "05", "05B", "06", "06B", "07A", "07B",
    "08", "09", "10", "10B", "11A", "11B", "12", "12B", "13", "14", "14B", "15", "15B",
    "16", "17", "18", "19", "20", "21", "22",
    "23", "24",
    "25", "25B", "26", "26B", "27",
    "S1", "S2", "S3", "S4", "S5", "S6",
  ];
  assert.deepEqual(
    moves.map((m) => m.id),
    expectedIds,
  );

  const expectedCategoryCounts = {
    "Pan/Tilt": 7,
    "Zoom/Lens": 6,
    "Dolly/Track": 9,
    "Physical Moves": 11,
    "Human Camera": 2,
    "Drone/Crane": 5,
    "Specials": 6,
  };

  for (const [cat, count] of Object.entries(expectedCategoryCounts)) {
    const filtered = listMoves({ category: cat });
    assert.equal(filtered.length, count, `category ${cat} should have ${count} moves`);
  }
});

test("every camera movement prompt contains all 5 grammar slots and valid remotion_motion", () => {
  const moves = loadMoves();
  const validRemotionMotions = new Set(["static", "push", "pan", "handheld"]);

  for (const m of moves) {
    assert.ok(m.name && m.intent && m.when_to_use, `move ${m.id} missing metadata`);
    assert.ok(
      validRemotionMotions.has(m.remotion_motion),
      `move ${m.id} has invalid remotion_motion "${m.remotion_motion}"`,
    );
    for (const slot of ["Camera:", "Movement:", "Speed:", "Framing:", "End:"]) {
      assert.ok(
        m.prompt.includes(slot),
        `move ${m.id} (${m.slug}) prompt is missing slot "${slot}"`,
      );
    }
  }
});

test("getMove resolves by ID, slug, title, or alias (case-insensitive)", () => {
  assert.equal(getMove("07B")?.slug, "crash-zoom-out");
  assert.equal(getMove("07b")?.slug, "crash-zoom-out");
  assert.equal(getMove("Shot 07B")?.slug, "crash-zoom-out");
  assert.equal(getMove("S1")?.slug, "fpv");
  assert.equal(getMove("crash-zoom-out")?.id, "07B");
  assert.equal(getMove("low-tracking")?.id, "20");
  assert.equal(getMove("Body-mounted camera / Snorricam")?.slug, "snorricam");
  assert.equal(getMove("walk-and-talk")?.slug, "reverse-tracking");
  assert.equal(getMove("pass-through-objects")?.slug, "pass-through");
  assert.equal(getMove("non-existent-camera-move"), null);

  assert.match(formatCameraBlock("dolly-in"), /^Camera:.*Movement:.*Speed:.*Framing:.*End:/);
  assert.throws(() => formatCameraBlock("unknown-move"), /Unknown camera movement/);
});

test("buildClipPrompt separates camera movement from scene action, reference lock, and no-text guard", () => {
  const prompt = buildClipPrompt({
    move: "low-tracking",
    brief: "A courier in leather boots striding across wet cobblestones at dusk",
    refFrame: "frames/s2.png",
    refContext: "Low-angle start frame showing leather boots on wet stone",
    styleSuffix: "35mm anamorphic lens, tungsten streetlight reflections",
    noTextGuard: true,
  });

  assert.match(prompt, /^Camera movement:\nCamera:/);
  assert.ok(prompt.includes("Reference image context:\nLow-angle start frame"));
  assert.ok(prompt.includes(DEFAULT_REF_LOCK_NOTE));
  assert.ok(
    prompt.includes(
      "Scene action:\nA courier in leather boots striding across wet cobblestones at dusk",
    ),
  );
  assert.ok(
    prompt.includes("Mood and style:\n35mm anamorphic lens, tungsten streetlight reflections"),
  );
  assert.ok(prompt.endsWith(NO_TEXT_GUARD));

  // Without move, returns plain brief + style (+ optional guard)
  const plain = buildClipPrompt({
    brief: "A quiet studio desk",
    styleSuffix: "warm light",
    noTextGuard: true,
  });
  assert.equal(plain, `A quiet studio desk warm light ${NO_TEXT_GUARD}`);
});

test("manifest schema and validate-manifest accept visual.shot.move", () => {
  const schema = JSON.parse(
    readFileSync(join(ROOT, "skills/manifest/schema/manifest.schema.json"), "utf8"),
  );
  const shotProps = schema.definitions.scene.properties.visual.properties.shot.properties;
  assert.ok("move" in shotProps, "manifest.schema.json must include visual.shot.properties.move");
  assert.equal(shotProps.move.type, "string");

  const manifest = {
    version: "1",
    title: "camera-move-test",
    format: ["16:9"],
    fps: 30,
    brand: { palette: ["#0b0b0f", "#ffd24a"] },
    hook: { type: "bold_claim", text: "Camera movement drives emotion." },
    through_line: {
      kind: "counter",
      label: "shot",
      states: [
        { scene: "s1", value: 1 },
        { scene: "s2", value: 2 },
      ],
    },
    scenes: [
      {
        id: "s1",
        tts_script: "Camera movement drives emotion. Every trajectory has a purpose.",
        duration_estimate_s: 4,
        visual: {
          source: "code",
          component: "TitleCard",
          props: { headline: "Camera movement drives emotion." },
        },
        graphics: [{ kind: "tag", anchor: "trajectory", props: { text: "46 moves" } }],
      },
      {
        id: "s2",
        tts_script: "Track low along the boots to build anticipation before the reveal.",
        duration_estimate_s: 4,
        visual: {
          source: "clip",
          visual_brief: "Leather boots walking down a rain-lit alley at night",
          shot: {
            size: "close",
            angle: "low",
            motion: "pan",
            move: "low-tracking",
          },
        },
        graphics: [{ kind: "label", anchor: "anticipation", props: { text: "Low tracking" } }],
      },
    ],
  };

  const res = validate(manifest);
  assert.deepEqual(res.errors, []);
  assert.equal(res.pass, true);
});

test("camera-move.mjs CLI list, get, and build exit 0 with valid output", () => {
  const listOut = execFileSync("node", [CLI_PATH, "list", "--json"], {
    encoding: "utf8",
  });
  const parsed = JSON.parse(listOut);
  assert.equal(parsed.length, 46);

  const getOut = execFileSync("node", [CLI_PATH, "get", "S4", "--json"], {
    encoding: "utf8",
  });
  const move = JSON.parse(getOut);
  assert.equal(move.slug, "earth-zoom-out");

  const buildOut = execFileSync(
    "node",
    [
      CLI_PATH,
      "build",
      "--move",
      "dolly-in",
      "--brief",
      "A violinist tuning strings on an empty stage",
      "--ref-context",
      "Medium shot under a single spotlight",
      "--style",
      "anamorphic 35mm film look",
      "--no-text-guard",
    ],
    { encoding: "utf8" },
  );
  assert.ok(buildOut.includes("Camera movement:"));
  assert.ok(buildOut.includes("Reference image context:"));
  assert.ok(buildOut.includes("Scene action:"));
  assert.ok(buildOut.includes("No text, no captions, no interface, no logos."));
});

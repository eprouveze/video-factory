#!/usr/bin/env node
// Manifest audit: the machine gates a plan must pass BEFORE a human reviews it, and again
// after production. Exit 0 = every gate passes; exit 1 = at least one error.
//
// usage: node scripts/validate-manifest.mjs <manifest.json | project-dir>
//          [--require-approval]   also fail unless the approval hash matches
//          [--json]               machine-readable result on stdout
//
// Gates (each has a negative-control test in tests/):
//   ids          scene ids unique, graphics well-formed
//   hook         readable on-screen premise inside the first second
//   graphics     every narrated sentence has an explaining graphic, entering on a spoken word
//   variety      enough graphic kinds; never the same kind three times running
//   through-line one escalating device carried across the whole video
//   pacing       no shot under the minimum outside a declared run; treatments never repeat
//   generated-text  text belongs in code, never in a generated image or clip
//   approval     (--require-approval) the plan is unchanged since a person approved it
//   budget       the estimate fits under the cap, and every paid adapter has a price
//   grid         (after snap-grid) every cut lands on a beat of the music bed
//   look         (after production) generated stills are on-palette, large enough, not duplicates
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sentences,
  anchorIndex,
  anchorMs,
  sceneMs,
  cutFrames,
  tokens,
  isApproved,
  approvalHash,
  estimateCost,
} from "./lib/manifest-lib.mjs";

export const GRAPHIC_KINDS = [
  "counter",
  "bar",
  "gauge",
  "tally",
  "stamp",
  "tag",
  "label",
  "terminal",
  "chat",
  "strike",
  "checklist",
  "timeline",
];

const TEXT_IN_BRIEF =
  /\b(text|caption|headline|title|label|logo|sign|word|words|number|numbers|chart|graph|diagram|ui|interface|screenshot|menu|subtitle)s?\b/i;

const hamming = (a, b) => {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
};

export function validate(manifest, { registry, requireApproval = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (gate, scene, message) => errors.push({ gate, scene, message });
  const warn = (gate, scene, message) =>
    warnings.push({ gate, scene, message });

  const scenes = manifest.scenes ?? [];
  const rules = {
    min_shot_ms: 1000,
    max_static_ms: 4000,
    min_graphic_kinds: 6,
    through_line: true,
    graphic_per_sentence: true,
    ...(manifest.rules ?? {}),
  };

  // ── ids ────────────────────────────────────────────────────────────────────────────
  const seen = new Set();
  for (const s of scenes) {
    if (seen.has(s.id)) err("ids", s.id, `duplicate scene id "${s.id}"`);
    seen.add(s.id);
    for (const g of s.graphics ?? []) {
      if (!GRAPHIC_KINDS.includes(g.kind))
        err(
          "ids",
          s.id,
          `unknown graphic kind "${g.kind}" (one of ${GRAPHIC_KINDS.join(", ")})`,
        );
      if (!g.anchor) err("ids", s.id, `graphic "${g.kind}" has no anchor word`);
    }
  }

  // ── hook ───────────────────────────────────────────────────────────────────────────
  const first = scenes[0];
  if (!manifest.hook?.text) err("hook", null, "hook.text is missing");
  else if (tokens(manifest.hook.text).length > 12)
    err(
      "hook",
      null,
      `hook.text is ${tokens(manifest.hook.text).length} words; keep it to 12 so it reads in a second`,
    );
  if (first) {
    const v = first.visual ?? {};
    const p = v.props ?? {};
    const cardText =
      v.source === "code" && (p.headline || p.value || p.eyebrow || p.quote);
    const overlay = !!v.overlay;
    const earlyGraphic = (first.graphics ?? []).some(
      (g) => anchorMs(first, g) <= 1000,
    );
    if (!cardText && !overlay && !earlyGraphic)
      err(
        "hook",
        first.id,
        "nothing readable is on screen by 1.0 s: give the first scene explicit card copy (props.headline/value), an overlay, or a graphic anchored in its first second",
      );
  }

  // ── graphics: one explaining graphic per narrated sentence, entering on a spoken word ──
  const kindSeq = [];
  for (const s of scenes) {
    const sents = sentences(s.tts_script);
    const covered = new Array(sents.length).fill(false);
    const v = s.visual ?? {};
    // a code card IS the graphic for the sentence it opens on
    if (v.source === "code" && sents.length) {
      covered[0] = true;
      kindSeq.push({ kind: `card:${v.component ?? "TitleCard"}`, scene: s.id });
    }
    const placed = [];
    for (const g of s.graphics ?? []) {
      if (!g.anchor) continue;
      const idx = anchorIndex(s.tts_script, g.anchor, g.occurrence ?? 1);
      if (idx < 0) {
        err(
          "graphics",
          s.id,
          `graphic "${g.kind}" is anchored on "${g.anchor}", which the narration never says`,
        );
        continue;
      }
      const si = sents.findIndex((x) => idx >= x.from && idx < x.to);
      if (si >= 0) covered[si] = true;
      placed.push({ kind: g.kind, idx });
    }
    placed
      .sort((a, b) => a.idx - b.idx)
      .forEach((g) => kindSeq.push({ kind: g.kind, scene: s.id }));
    if (rules.graphic_per_sentence && !s.stillness)
      sents.forEach((x, i) => {
        if (!covered[i])
          err(
            "graphics",
            s.id,
            `no graphic explains: "${x.text}" (add one anchored on a word in it, or set scene.stillness with the reason)`,
          );
      });

    for (const g of s.graphics ?? []) {
      const left = sceneMs(s) - anchorMs(s, g);
      if (g.anchor && anchorIndex(s.tts_script, g.anchor, g.occurrence ?? 1) >= 0 && left < 1000)
        warn("pacing", s.id, `graphic "${g.kind}" enters on "${g.anchor}" with ${Math.round(left)} ms left in the scene; anchor it earlier or it will not be read`);
    }
    // longest stretch with nothing new arriving on screen
    const marks = [
      0,
      ...(s.graphics ?? []).map((g) => anchorMs(s, g)),
      sceneMs(s),
    ].sort((a, b) => a - b);
    const gap = Math.max(...marks.slice(1).map((t, i) => t - marks[i]));
    if (gap > rules.max_static_ms && !s.stillness && v.source !== "clip")
      warn(
        "pacing",
        s.id,
        `${(gap / 1000).toFixed(1)} s with nothing new on screen (limit ${rules.max_static_ms / 1000} s)`,
      );
  }

  // ── variety ────────────────────────────────────────────────────────────────────────
  for (let i = 2; i < kindSeq.length; i++)
    if (
      kindSeq[i].kind === kindSeq[i - 1].kind &&
      kindSeq[i].kind === kindSeq[i - 2].kind
    )
      err(
        "variety",
        kindSeq[i].scene,
        `"${kindSeq[i].kind}" three times in a row; change the form`,
      );
  const distinct = new Set(kindSeq.map((k) => k.kind)).size;
  const need = Math.min(
    rules.min_graphic_kinds,
    Math.ceil(kindSeq.length * 0.6),
  );
  if (kindSeq.length >= 4 && distinct < need)
    err(
      "variety",
      null,
      `${distinct} graphic kinds across ${kindSeq.length} graphics; need at least ${need}`,
    );

  // ── through-line ───────────────────────────────────────────────────────────────────
  const tl = manifest.through_line;
  if (rules.through_line) {
    if (!tl)
      err(
        "through-line",
        null,
        "no through_line: name the one device every scene carries (a counter, a clock, a progress bar, a tag)",
      );
    else {
      const st = tl.states ?? [];
      if (st.length < 2)
        err(
          "through-line",
          null,
          "through_line needs at least two states; a device that never changes is decoration",
        );
      if (st.length && scenes.length && st[0].scene !== scenes[0].id)
        err(
          "through-line",
          null,
          `through_line must start in the first scene ("${scenes[0].id}")`,
        );
      let last = -1;
      st.forEach((x, i) => {
        const at = scenes.findIndex((s) => s.id === x.scene);
        if (at < 0)
          err(
            "through-line",
            x.scene,
            `through_line state points at unknown scene "${x.scene}"`,
          );
        else if (at <= last)
          err(
            "through-line",
            x.scene,
            "through_line states must follow scene order",
          );
        else last = at;
        if (i && String(x.value) === String(st[i - 1].value))
          err(
            "through-line",
            x.scene,
            `through_line repeats the value "${x.value}"; each state must move it on`,
          );
      });
    }
  }

  // ── pacing ─────────────────────────────────────────────────────────────────────────
  scenes.forEach((s, i) => {
    const ms = sceneMs(s);
    if (ms < rules.min_shot_ms && !s.run)
      err(
        "pacing",
        s.id,
        `shot is ${ms} ms; nothing under ${rules.min_shot_ms} ms outside a declared run (scene.run: true)`,
      );
    const prev = scenes[i - 1];
    const m = (x) =>
      x?.visual?.source === "image" ? (x.visual.shot?.motion ?? "push") : null;
    if (prev && m(s) && m(s) === m(prev))
      err(
        "pacing",
        s.id,
        `still treatment "${m(s)}" repeats from "${prev.id}"; never the same move twice in a row`,
      );
  });

  // ── generated text ─────────────────────────────────────────────────────────────────
  for (const s of scenes) {
    const v = s.visual ?? {};
    if (
      (v.source === "image" || v.source === "clip") &&
      !v.asset &&
      TEXT_IN_BRIEF.test(v.visual_brief ?? "")
    )
      warn(
        "generated-text",
        s.id,
        "the brief asks a generator for text, numbers or interface; draw those in code (graphics / overlay) and keep the plate textless",
      );
  }
  if (
    (manifest.compositor ?? "remotion") !== "remotion" &&
    (tl || scenes.some((s) => s.graphics?.length))
  )
    warn(
      "graphics",
      null,
      "graphics and the through-line render in the remotion compositor only",
    );

  // ── approval ───────────────────────────────────────────────────────────────────────
  if (manifest.approval && !isApproved(manifest))
    (requireApproval ? err : warn)(
      "approval",
      null,
      "the plan changed after it was approved; it needs approval again",
    );
  if (requireApproval && !manifest.approval)
    err(
      "approval",
      null,
      "not approved (run scripts/approve.mjs after the human review)",
    );

  // ── budget ─────────────────────────────────────────────────────────────────────────
  const cost = registry ? estimateCost(manifest, registry) : null;
  const b = manifest.budget;
  if (b && cost) {
    if (b.frozen && cost.calls.length)
      err("budget", null, "budget.frozen is set: no paid call may run");
    if (typeof b.cap_usd === "number") {
      if (cost.unpriced.length)
        err(
          "budget",
          null,
          `a cap is set but these paid adapters have no est_usd in providers.json: ${cost.unpriced.join(", ")}`,
        );
      // generated seconds run about twice the seconds that reach the cut
      const planned = cost.est_usd * 2;
      if (planned > b.cap_usd)
        err(
          "budget",
          null,
          `estimate $${planned.toFixed(2)} (list price x2 for retakes) is over the $${b.cap_usd} cap`,
        );
    }
  }

  // ── grid: cuts on beats ────────────────────────────────────────────────────────────
  const grid = manifest.grid;
  if (grid?.snapped && Array.isArray(grid.beats_ms) && grid.beats_ms.length) {
    const fps = manifest.fps ?? 30;
    const tol = Math.max(30, 500 / fps + 1);
    const cuts = cutFrames(manifest).slice(0, -1);
    for (const c of cuts) {
      const d = Math.min(...grid.beats_ms.map((t) => Math.abs(t - c.ms)));
      if (d > tol)
        err(
          "grid",
          c.id,
          `cut after "${c.id}" is ${d.toFixed(0)} ms off the nearest beat (tolerance ${tol.toFixed(0)} ms); re-run snap-grid`,
        );
    }
  }

  // ── look ───────────────────────────────────────────────────────────────────────────
  const minScore = manifest.brand?.palette_min_score ?? 60;
  const looks = scenes.filter((s) => s._look);
  for (const s of looks) {
    const l = s._look;
    if (typeof l.palette_score === "number" && l.palette_score < minScore)
      err(
        "look",
        s.id,
        `palette score ${l.palette_score} is under ${minScore}; remake it at the source, do not grade it`,
      );
    if (l.width && Math.min(l.width, l.height ?? l.width) < 800)
      err(
        "look",
        s.id,
        `plate is ${l.width}x${l.height}; check and build on 800 px or more`,
      );
  }
  for (let i = 0; i < looks.length; i++)
    for (let j = i + 1; j < looks.length; j++)
      if (
        looks[i]._look.ahash &&
        looks[j]._look.ahash &&
        hamming(looks[i]._look.ahash, looks[j]._look.ahash) <= 4
      )
        err(
          "look",
          looks[j].id,
          `plate is a near-duplicate of "${looks[i].id}"; one image per shot`,
        );

  return {
    pass: errors.length === 0,
    errors,
    warnings,
    stats: {
      scenes: scenes.length,
      graphics: kindSeq.length,
      graphic_kinds: distinct,
      duration_s: +(scenes.reduce((a, s) => a + sceneMs(s), 0) / 1000).toFixed(
        2,
      ),
      est_usd: cost ? +cost.est_usd.toFixed(2) : null,
      paid_calls: cost ? cost.calls.length : null,
      approval_hash: approvalHash(manifest),
      approved: isApproved(manifest),
    },
  };
}

export function loadManifest(arg) {
  let p = resolve(arg || ".");
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "manifest.json");
  return { path: p, manifest: JSON.parse(readFileSync(p, "utf8")) };
}

export function loadRegistry() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return JSON.parse(
    readFileSync(join(root, "providers/providers.json"), "utf8"),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const { path, manifest } = loadManifest(
    args.find((a) => !a.startsWith("--")),
  );
  const res = validate(manifest, {
    registry: loadRegistry(),
    requireApproval: flags.has("--require-approval"),
  });
  if (flags.has("--json"))
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  else {
    const line = (x) =>
      `  [${x.gate}]${x.scene ? ` ${x.scene}:` : ""} ${x.message}\n`;
    process.stdout.write(`${path}\n`);
    res.errors.forEach((e) => process.stdout.write(`ERROR${line(e)}`));
    res.warnings.forEach((w) => process.stdout.write(`warn ${line(w)}`));
    const s = res.stats;
    process.stdout.write(
      `${res.pass ? "PASS" : "FAIL"}: ${res.errors.length} errors, ${res.warnings.length} warnings · ${s.scenes} scenes, ${s.graphics} graphics in ${s.graphic_kinds} kinds, ${s.duration_s} s` +
        (s.paid_calls
          ? ` · ${s.paid_calls} paid calls, about $${s.est_usd} at list`
          : "") +
        ` · ${s.approved ? "approved" : "not approved"}\n`,
    );
  }
  process.exit(res.pass ? 0 : 1);
}

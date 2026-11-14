// Node-side manifest helpers: the approval hash and the cost estimate. Word anchors, sentences
// and cut times live in anchors.mjs (browser-safe) and are re-exported here.

import { createHash } from "node:crypto";
import { sceneMs } from "./anchors.mjs";

export * from "./anchors.mjs";

// Fields the pipeline writes while producing. They are left out of the approval hash, so
// producing a video never invalidates the approval, and any creative edit always does.
const PRODUCED_TOP = new Set(["approval", "grid", "_music_generated"]);
const PRODUCED_SCENE = new Set([
  "audio_ms",
  "_audio",
  "_sfx",
  "_look",
  "word_timings",
]);

function creativeView(manifest) {
  const top = {};
  for (const k of Object.keys(manifest).sort()) {
    if (PRODUCED_TOP.has(k) || k === "scenes") continue;
    // a SUPPLIED music bed is a creative choice; a generated one is a product
    if (k === "music" && manifest._music_generated) continue;
    top[k] = manifest[k];
  }
  top.scenes = (manifest.scenes ?? []).map((s) => {
    const o = {};
    for (const k of Object.keys(s).sort()) {
      if (PRODUCED_SCENE.has(k)) continue;
      // duration_ms: the pipeline measures it for narrated and clip scenes, so there it is a
      // product. On a silent scene it is authored; snap-grid keeps the authored length in
      // audio_ms, so hashing that keeps the approval stable through production.
      if (k === "duration_ms") {
        const measured =
          s.tts_script || s.tts_phonetic || s.voiceover || s.visual?.source === "clip";
        if (!measured) o.duration_authored = s.audio_ms ?? s.duration_ms;
        continue;
      }
      if (k === "visual") {
        // a SUPPLIED asset is a creative choice; a generated one is a product
        const { asset, _generated, ...v } = s.visual ?? {};
        o.visual = _generated ? v : { ...v, asset };
      } else o[k] = s[k];
    }
    return o;
  });
  return top;
}

const stable = (v) =>
  Array.isArray(v)
    ? `[${v.map(stable).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .filter((k) => v[k] !== undefined)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
          .join(",")}}`
      : JSON.stringify(v ?? null);

// Reference images for one generated still, and the sentence that tells the model what
// each one is for. Scene continuity_refs come first (same character and setting), then
// brand.look_ref (colour and texture only). The sentence is appended to the brief because
// an attached image with no stated role gets copied wholesale or ignored.
export function imageRefs(scene, brand, projDir, { continuity = true } = {}) {
  const abs = (p) => (projDir ? `${projDir}/${p}`.replace(/\/{2,}/g, "/") : p);
  const cont = continuity ? (scene?.continuity_refs ?? []).filter(Boolean) : [];
  const look = brand?.look_ref ? [brand.look_ref] : [];
  const refs = [...cont, ...look].map(abs);
  const parts = [];
  if (cont.length)
    parts.push(
      cont.length === 1
        ? "Reference image 1 shows the established character and setting: keep the same face, hair, clothing and set design."
        : `Reference images 1 to ${cont.length} show the established character and setting: keep the same face, hair, clothing and set design.`,
    );
  if (look.length)
    parts.push(
      `Reference image ${cont.length + 1} is a colour and texture reference only: match its palette and grain, do not copy its content.`,
    );
  return { refs: refs.length ? refs : undefined, note: parts.length ? ` ${parts.join(" ")}` : "" };
}

export const approvalHash = (manifest) =>
  createHash("sha256")
    .update(stable(creativeView(manifest)))
    .digest("hex");

export const isApproved = (manifest) =>
  !!manifest.approval?.hash &&
  manifest.approval.hash === approvalHash(manifest);

// Paid calls the manifest will make, with a list-price estimate where the registry carries
// one (`est_usd` per call, or per second for clips/music). `unpriced` lists paid adapters
// with no price: a spend cap cannot be enforced over those.
export function estimateCost(manifest, registry) {
  const caps = registry?.capabilities ?? {};
  const pick = (cap, name) => {
    const prov = name || caps[cap]?.default;
    return { prov, a: caps[cap]?.adapters?.[prov] };
  };
  const calls = [];
  const add = (cap, name, scene, seconds) => {
    const { prov, a } = pick(cap, name);
    if (!prov || !a || a.tier === "core") return;
    const unit = a.est_usd;
    const est =
      typeof unit === "number"
        ? a.est_unit === "second"
          ? unit * seconds
          : unit
        : null;
    calls.push({
      capability: cap,
      provider: prov,
      scene,
      seconds,
      est_usd: est,
    });
  };
  let total_s = 0;
  for (const s of manifest.scenes ?? []) {
    const sec = sceneMs(s) / 1000;
    total_s += sec;
    const pa = s.provider_assignments ?? {};
    if ((s.tts_script || s.tts_phonetic) && !s.voiceover && !s._audio)
      add("tts", pa.tts, s.id, sec);
    const v = s.visual ?? {};
    if (v.source === "clip" && !v.asset) {
      if (
        (v.ref_lock ?? manifest.brand?.ref_lock ?? true) &&
        !s.continuity_refs?.length
      )
        add("image", pa.image, s.id, 0);
      add("clip", pa.clip, s.id, sec);
    }
    if (v.source === "image" && !v.asset) add("image", pa.image, s.id, 0);
    for (const _ of Array.isArray(s.sfx) && !s._sfx ? s.sfx : [])
      add("sfx", undefined, s.id, 0);
  }
  if (!manifest.music) add("music", undefined, null, total_s);
  const unpriced = [
    ...new Set(
      calls
        .filter((c) => c.est_usd === null)
        .map((c) => `${c.capability}:${c.provider}`),
    ),
  ];
  const est_usd = calls.reduce((a, c) => a + (c.est_usd ?? 0), 0);
  return { calls, est_usd, unpriced };
}

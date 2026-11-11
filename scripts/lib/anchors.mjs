// Pure helpers (no Node built-ins): shared by the validators, the producer AND the Remotion
// bundle, so a word anchor resolves to the same time everywhere.

export const norm = (w) =>
  String(w ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "");

export const tokens = (text) =>
  String(text ?? "")
    .split(/\s+/)
    .map(norm)
    .filter(Boolean);

// Sentences of a narration, each with the token range it covers in the scene. An ellipsis is
// a pause marker inside a sentence, not a boundary.
export function sentences(text) {
  const out = [];
  let from = 0;
  for (const raw of String(text ?? "").split(/(?<=[.!?])\s+/)) {
    const n = tokens(raw).length;
    if (!n) continue;
    out.push({ text: raw.trim(), from, to: from + n });
    from += n;
  }
  return out;
}

// Index of the first token of `anchor` (a word or short phrase) in the scene's narration.
// `occurrence` is 1-based. Returns -1 when the phrase is not spoken in the scene.
export function anchorIndex(script, anchor, occurrence = 1) {
  const hay = tokens(script);
  const needle = tokens(anchor);
  if (!needle.length) return -1;
  let seen = 0;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((t, k) => hay[i + k] === t)) {
      seen += 1;
      if (seen === occurrence) return i;
    }
  }
  return -1;
}

export const sceneMs = (s) =>
  s.duration_ms ?? Math.round((s.duration_estimate_s ?? 4) * 1000);

// When (ms from the scene start) the anchor word is spoken. Uses real word timings when
// their count matches the script; otherwise spreads words evenly over the scene.
export function anchorMs(scene, graphic) {
  if (!graphic?.anchor) return 0;
  const idx = anchorIndex(
    scene.tts_script,
    graphic.anchor,
    graphic.occurrence ?? 1,
  );
  if (idx < 0) return 0;
  const n = tokens(scene.tts_script).length;
  const wt = scene.word_timings;
  if (Array.isArray(wt) && wt.length === n && wt[idx]) return wt[idx].start_ms;
  return Math.round((idx / Math.max(1, n)) * sceneMs(scene));
}

// Cut times exactly as the compositor produces them: each scene is rounded to whole frames
// and the frames are summed. Returns the frame and ms of every scene END.
export function cutFrames(manifest) {
  const fps = manifest.fps ?? 30;
  let acc = 0;
  return (manifest.scenes ?? []).map((s) => {
    acc += Math.max(1, Math.round((sceneMs(s) / 1000) * fps));
    return { id: s.id, frame: acc, ms: (acc / fps) * 1000 };
  });
}

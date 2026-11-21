// Operator events for scripts/telemetry.mjs: one schema for `event add` and `event import`,
// and the figures derived from it (idea ledger, quality taps, review intervals).
// Nothing here reads the clock except the default `at` of a new event.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const SIMPLE_KINDS = [
  "correction",
  "rejection",
  "approval",
  "gate",
  "waiting",
];
export const EVENT_KINDS = [...SIMPLE_KINDS, "idea", "review", "quality"];
export const LIVE_ORIGINS = [
  "human",
  "ai-chosen",
  "human-seeded-ai-developed",
  "ai-seeded-human-developed",
  "real-system",
];
export const ORIGINS = [...LIVE_ORIGINS, "dropped"];
// Origins that count as an AI proposal the human kept.
export const AI_ACCEPTED = [
  "ai-chosen",
  "human-seeded-ai-developed",
  "ai-seeded-human-developed",
];
export const PROPOSERS = ["human", "ai", "real-system"];
export const LABELLERS = ["human", "agent"];

const FIELDS = {
  correction: ["note", "source", "gate"],
  rejection: ["note", "source", "gate"],
  approval: ["note", "source", "gate"],
  gate: ["note", "source", "gate"],
  waiting: ["note", "source", "gate"],
  idea: [
    "element",
    "origin",
    "proposer",
    "labelled_by",
    "source",
    "options_offered",
    "surprise",
    "supersedes",
    "dropped_origin",
    "note",
  ],
  review: ["artifact", "start", "end", "note", "source"],
  quality: ["artifact", "score", "gate", "labelled_by", "note", "source"],
};

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ratio = (a, b) => (b ? Math.round((a / b) * 1e4) / 1e4 : null);
const isoOrThrow = (v, label) => {
  const ms = Date.parse(v);
  if (typeof v !== "string" || Number.isNaN(ms))
    throw new Error(`${label} is not an ISO time: ${v}`);
  return new Date(ms).toISOString();
};
const oneOf = (v, list, label) => {
  if (!list.includes(v))
    throw new Error(`${label} must be one of ${list.join(", ")}`);
  return v;
};
const text = (v, label) => {
  if (typeof v !== "string" || !v.trim())
    throw new Error(`${label} is required`);
  return v;
};

// One validated record with a fixed key order, or an Error that names the field.
export function normalizeEvent(raw, { now = new Date() } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("an event is a JSON object");
  const kind = oneOf(raw.kind, EVENT_KINDS, "kind");
  const allowed = new Set(["kind", "at", ...FIELDS[kind]]);
  for (const k of Object.keys(raw))
    if (!allowed.has(k))
      throw new Error(`unknown field for a ${kind} event: ${k}`);
  const has = (k) => raw[k] != null && raw[k] !== "";
  const rec = { at: null, kind };
  if (SIMPLE_KINDS.includes(kind)) {
    rec.note = text(raw.note, "note");
    if (has("gate")) rec.gate = String(raw.gate);
  } else if (kind === "idea") {
    rec.element = text(raw.element, "element");
    rec.origin = oneOf(raw.origin, ORIGINS, "origin");
    rec.proposer = oneOf(raw.proposer, PROPOSERS, "proposer");
    rec.labelled_by = oneOf(raw.labelled_by, LABELLERS, "labelled_by");
    rec.source = text(raw.source, "source");
    if (has("options_offered")) {
      const n = Number(raw.options_offered);
      if (!Number.isInteger(n) || n < 1)
        throw new Error("options_offered must be a positive integer");
      rec.options_offered = n;
    }
    if (raw.surprise === true || raw.surprise === "true") rec.surprise = true;
    else if (has("surprise") && raw.surprise !== false)
      throw new Error("surprise is a flag: true or absent");
    if (has("supersedes")) rec.supersedes = String(raw.supersedes);
    if (has("dropped_origin")) {
      if (rec.origin !== "dropped")
        throw new Error("dropped_origin only goes with origin dropped");
      rec.dropped_origin = oneOf(
        raw.dropped_origin,
        LIVE_ORIGINS,
        "dropped_origin",
      );
    }
    if (has("note")) rec.note = String(raw.note);
  } else if (kind === "review") {
    rec.artifact = text(raw.artifact, "artifact");
    rec.start = isoOrThrow(raw.start, "start");
    rec.end = isoOrThrow(raw.end, "end");
    if (rec.end <= rec.start) throw new Error("a review ends after it starts");
    if (has("note")) rec.note = String(raw.note);
  } else {
    rec.artifact = text(raw.artifact, "artifact");
    const score = Number(raw.score);
    if (!Number.isInteger(score) || score < 1 || score > 5)
      throw new Error("score must be an integer from 1 to 5");
    rec.score = score;
    if (has("gate")) rec.gate = String(raw.gate);
    // Quality is a person's judgement: no other label is accepted.
    if (has("labelled_by") && raw.labelled_by !== "human")
      throw new Error("a quality event is labelled by a human");
    rec.labelled_by = "human";
    if (has("note")) rec.note = String(raw.note);
  }
  if (kind !== "idea" && has("source")) rec.source = String(raw.source);
  rec.at = has("at")
    ? isoOrThrow(raw.at, "at")
    : kind === "review"
      ? rec.start
      : now.toISOString();
  return rec;
}

const eventsFile = (project) =>
  join(resolve(project), "telemetry", "events.jsonl");

export function addEvent(project, raw, opts) {
  const rec = normalizeEvent(raw, opts);
  mkdirSync(join(resolve(project), "telemetry"), { recursive: true });
  appendFileSync(eventsFile(project), JSON.stringify(rec) + "\n");
  return rec;
}

// Bulk backfill. Every line is validated before anything is written; a line that is already
// in the ledger (or repeated in the file) is skipped, so an import can be run again.
export function importEvents(project, file) {
  const lines = readFileSync(resolve(file), "utf8").split("\n");
  const recs = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`${file} line ${i + 1}: not JSON`);
    }
    if (
      raw &&
      typeof raw === "object" &&
      raw.at == null &&
      raw.kind !== "review"
    ) {
      throw new Error(`${file} line ${i + 1}: at is required in an import`);
    }
    try {
      recs.push(JSON.stringify(normalizeEvent(raw)));
    } catch (e) {
      throw new Error(`${file} line ${i + 1}: ${e.message}`);
    }
  });
  const path = eventsFile(project);
  const known = new Set(
    existsSync(path)
      ? readFileSync(path, "utf8").split("\n").filter(Boolean)
      : [],
  );
  const fresh = [];
  for (const r of recs) {
    if (known.has(r)) continue;
    known.add(r);
    fresh.push(r);
  }
  mkdirSync(join(resolve(project), "telemetry"), { recursive: true });
  if (fresh.length) appendFileSync(path, fresh.map((r) => r + "\n").join(""));
  return {
    lines: recs.length,
    imported: fresh.length,
    skipped: recs.length - fresh.length,
  };
}

// Events in time order; the order of the file breaks a tie.
export function orderEvents(events) {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => cmp(a.e.at, b.e.at) || a.i - b.i)
    .map((x) => x.e);
}

// The idea ledger: the latest event of an element wins. A dropped element remembers what it was.
export function ideaLedger(ordered) {
  const elements = new Map();
  let reproposals = 0;
  const drop = (st, by) => {
    if (st.origin === "dropped") return;
    st.dropped_origin = st.origin;
    st.origin = "dropped";
    st.superseded_by = by;
  };
  for (const e of ordered) {
    if (e.kind !== "idea") continue;
    const st = elements.get(e.element) ?? {
      element: e.element,
      origin: null,
      dropped_origin: null,
      reproposals: 0,
      surprise: false,
      superseded_by: null,
      events: 0,
    };
    const was = st.origin === "dropped" ? st.dropped_origin : st.origin;
    if (st.origin === "dropped" && e.origin !== "dropped") {
      st.reproposals += 1;
      reproposals += 1;
    }
    st.origin = e.origin;
    st.dropped_origin =
      e.origin === "dropped" ? (e.dropped_origin ?? was ?? null) : null;
    if (e.origin !== "dropped") st.superseded_by = null;
    st.proposer = e.proposer;
    st.labelled_by = e.labelled_by;
    st.source = e.source;
    if (e.options_offered != null) st.options_offered = e.options_offered;
    if (e.surprise) st.surprise = true;
    st.events += 1;
    elements.set(e.element, st);
    if (
      e.supersedes &&
      elements.has(e.supersedes) &&
      e.supersedes !== e.element
    )
      drop(elements.get(e.supersedes), e.element);
  }
  return {
    elements: [...elements.values()].sort((a, b) => cmp(a.element, b.element)),
    reproposals,
  };
}

// Every ratio is given with its numerator and denominator.
function creativityOf(elements, ideaEvents) {
  const live = elements.filter((x) => x.origin !== "dropped");
  const dropped = elements.filter((x) => x.origin === "dropped");
  const accepted = live.filter((x) => AI_ACCEPTED.includes(x.origin)).length;
  const aiDropped = dropped.filter((x) => x.proposer === "ai").length;
  const offered = ideaEvents.filter((e) => e.options_offered != null);
  const optionsTotal = offered.reduce((n, e) => n + e.options_offered, 0);
  return {
    elements: elements.length,
    live: live.length,
    dropped: dropped.length,
    by_origin: LIVE_ORIGINS.map((origin) => {
      const count = live.filter((x) => x.origin === origin).length;
      return {
        origin,
        count,
        of: live.length,
        share: ratio(count, live.length),
      };
    }),
    ai_acceptance: {
      accepted,
      ai_proposed_dropped: aiDropped,
      numerator: accepted,
      denominator: accepted + aiDropped,
      rate: ratio(accepted, accepted + aiDropped),
    },
    options_offered: {
      decisions: offered.length,
      options: optionsTotal,
      mean: ratio(optionsTotal, offered.length),
    },
    surprise_declared: elements.filter((x) => x.surprise).length,
    reproposals: elements.reduce((n, x) => n + x.reproposals, 0),
  };
}

export function creativity(ordered) {
  const ideas = ordered.filter((e) => e.kind === "idea");
  const { elements } = ideaLedger(ordered);
  return {
    ...creativityOf(elements, ideas),
    by_labelled_by: LABELLERS.map((who) => ({
      labelled_by: who,
      ...creativityOf(
        elements.filter((x) => x.labelled_by === who),
        ideas.filter((e) => e.labelled_by === who),
      ),
    })),
    ledger: elements.map((x) => ({
      element: x.element,
      origin: x.origin,
      dropped_origin: x.dropped_origin,
      proposer: x.proposer,
      labelled_by: x.labelled_by,
      superseded_by: x.superseded_by,
      source: x.source,
    })),
  };
}

export const SKIP_LIMIT = 0.3;
export const SKIP_MIN_GATES = 5;
const gateLabel = (e) => e.gate ?? e.note ?? "";

// Quality taps per gate, and how often the tap was skipped at a gate.
export function quality(ordered) {
  const taps = ordered.filter((e) => e.kind === "quality");
  const dist = (list) => ({
    n: list.length,
    sum: list.reduce((n, e) => n + e.score, 0),
    mean: ratio(
      list.reduce((n, e) => n + e.score, 0),
      list.length,
    ),
    scores: Object.fromEntries(
      [1, 2, 3, 4, 5].map((v) => [
        `score_${v}`,
        list.filter((e) => e.score === v).length,
      ]),
    ),
  });
  const labels = [...new Set(taps.map((e) => e.gate ?? ""))].sort(cmp);
  const gates = ordered.filter((e) => e.kind === "gate");
  const tapped = new Set(taps.filter((e) => e.gate != null).map((e) => e.gate));
  const skipped = gates.filter((e) => !tapped.has(gateLabel(e))).length;
  const share = ratio(skipped, gates.length);
  return {
    ...dist(taps),
    by_gate: labels.map((g) => ({
      gate: g || "(no gate)",
      ...dist(taps.filter((e) => (e.gate ?? "") === g)),
    })),
    skip: {
      gates: gates.length,
      skipped,
      numerator: skipped,
      denominator: gates.length,
      share,
      retire:
        gates.length >= SKIP_MIN_GATES && share != null && share > SKIP_LIMIT,
    },
  };
}

// Review intervals as merged [start, end] pairs in milliseconds.
export function reviewIntervals(ordered) {
  const raw = ordered
    .filter((e) => e.kind === "review")
    .map((e) => [Date.parse(e.start), Date.parse(e.end)])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of raw) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

export const overlapMs = (start, end, intervals) =>
  intervals.reduce(
    (n, [s, e]) => n + Math.max(0, Math.min(end, e) - Math.max(start, s)),
    0,
  );

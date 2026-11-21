// Derived KPIs for scripts/telemetry.mjs: effort ratios, backward cascade, EDL survival and
// render QC. Rule for every figure here: a ratio is never given without its numerator and
// its denominator.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const ratio = (a, b) => (b ? r4(a / b) : null);
const secs = (ms) => Math.round(ms) / 1000;
const ALL = [
  "input_tokens",
  "output_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
];
const allTokens = (row) => ALL.reduce((n, f) => n + (row?.[f] ?? 0), 0);

export const QC_DEFAULTS = {
  black_min_s: 0.1,
  black_pix_th: 0.05,
  freeze_noise_db: -60,
  freeze_min_s: 0.22,
};
export const DEFAULT_EDIT_TOOLS = [
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "apply_patch",
];

// ── the final render ────────────────────────────────────────────────────────────────────
function tool(bin, args) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.error || r.status !== 0) return null;
  return { stdout: r.stdout, stderr: r.stderr };
}

export function probeDuration(file) {
  if (!file || !existsSync(file)) return null;
  const r = tool("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  const n = r ? Number(r.stdout.trim()) : NaN;
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

function intervals(stderr, key) {
  const durations = [
    ...stderr.matchAll(new RegExp(`${key}_duration:\\s*([0-9.]+)`, "g")),
  ].map((m) => Number(m[1]));
  const starts = [
    ...stderr.matchAll(new RegExp(`${key}_start:\\s*([0-9.]+)`, "g")),
  ].length;
  return {
    count: starts,
    total_s: Math.round(durations.reduce((a, b) => a + b, 0) * 1000) / 1000,
  };
}

// Loudness, black frames, freeze frames and duration of the final video. Deterministic for a
// given ffmpeg build, which is why the build is recorded next to the figures.
export function renderQc(file, thresholds = {}) {
  const th = { ...QC_DEFAULTS, ...thresholds };
  if (!existsSync(file) || !statSync(file).isFile())
    throw new Error(`final video not found: ${file}`);
  const version = tool("ffmpeg", ["-version"]);
  if (!version) throw new Error("ffmpeg is not available");
  const run = (args) =>
    tool("ffmpeg", [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      ...args,
      "-f",
      "null",
      "-",
    ]);
  const loud = run(["-vn", "-af", "ebur128"]);
  const lufs = loud
    ? [...loud.stderr.matchAll(/I:\s*(-?[0-9.]+)\s*LUFS/g)].pop()
    : null;
  const black = run([
    "-an",
    "-vf",
    `blackdetect=d=${th.black_min_s}:pix_th=${th.black_pix_th}`,
  ]);
  const freeze = run([
    "-an",
    "-vf",
    `freezedetect=n=${th.freeze_noise_db}dB:d=${th.freeze_min_s}`,
  ]);
  return {
    file: basename(file),
    file_sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
    ffmpeg_version: version.stdout.split("\n")[0].trim(),
    duration_s: probeDuration(file),
    loudness_lufs: lufs ? Number(lufs[1]) : null,
    black: black
      ? {
          ...intervals(black.stderr, "black"),
          min_s: th.black_min_s,
          pix_th: th.black_pix_th,
        }
      : null,
    freeze: freeze
      ? {
          ...intervals(freeze.stderr, "freeze"),
          noise_db: th.freeze_noise_db,
          min_s: th.freeze_min_s,
        }
      : null,
  };
}

// ── EDL survival: seconds generated against seconds that are in the final cut ───────────
// Rows are {clip, in, out} in seconds, or cut-list rows {shot_id, in_ms, out_ms}, which stand
// for the shot's last usable take.
export function edlSurvival({
  edl,
  edlDir,
  project,
  takes,
  shotElements = {},
}) {
  const rows = Array.isArray(edl) ? edl : (edl?.clips ?? edl?.shots ?? []);
  const key = (t) => `${t.shot_id}#${t.take}`;
  const tail = (p) => `${basename(dirname(p))}/${basename(p)}`;
  const stats = new Map(
    takes.map((t) => [
      key(t),
      {
        shot: t.shot_id,
        take: t.take,
        generated_s: t.verdict === "failed" ? 0 : Number(t.duration_s) || 0,
        kept_s: 0,
      },
    ]),
  );
  let unmatched = 0;
  let unmatchedS = 0;
  for (const row of rows) {
    const len =
      row.in_ms != null
        ? (row.out_ms - row.in_ms) / 1000
        : Number(row.out) - Number(row.in);
    if (!Number.isFinite(len) || len < 0)
      throw new Error("an EDL row needs in/out (seconds) or in_ms/out_ms");
    let take = null;
    if (row.clip) {
      const want = resolve(edlDir, row.clip);
      take =
        takes.find(
          (t) => t.result_path && resolve(project, t.result_path) === want,
        ) ??
        takes.find(
          (t) => t.result_path && tail(t.result_path) === tail(row.clip),
        ) ??
        null;
    } else if (row.shot_id) {
      take =
        takes
          .filter((t) => t.shot_id === row.shot_id && t.verdict === "usable")
          .pop() ?? null;
    }
    if (!take) {
      unmatched += 1;
      unmatchedS += len;
      continue;
    }
    stats.get(key(take)).kept_s += len;
  }
  const round = (n) => Math.round(n * 1000) / 1000;
  const finish = (x) => ({
    ...x,
    generated_s: round(x.generated_s),
    kept_s: round(x.kept_s),
    ratio: ratio(x.kept_s, x.generated_s),
  });
  const byTake = [...stats.values()].sort(
    (a, b) => cmp(a.shot, b.shot) || a.take - b.take,
  );
  const shots = new Map();
  for (const t of byTake) {
    const s = shots.get(t.shot) ?? {
      shot: t.shot,
      takes: 0,
      generated_s: 0,
      kept_s: 0,
    };
    s.takes += 1;
    s.generated_s += t.generated_s;
    s.kept_s += t.kept_s;
    shots.set(t.shot, s);
  }
  const elements = new Map();
  for (const [shot, names] of Object.entries(shotElements)) {
    for (const name of names) {
      const e = elements.get(name) ?? {
        element: name,
        generated_s: 0,
        kept_s: 0,
      };
      e.generated_s += shots.get(shot)?.generated_s ?? 0;
      e.kept_s += shots.get(shot)?.kept_s ?? 0;
      elements.set(name, e);
    }
  }
  const generated = byTake.reduce((n, t) => n + t.generated_s, 0);
  const kept = byTake.reduce((n, t) => n + t.kept_s, 0);
  return {
    generated_s: round(generated),
    kept_s: round(kept),
    ratio: ratio(kept, generated),
    unmatched_rows: unmatched,
    unmatched_s: round(unmatchedS),
    by_shot: [...shots.values()].map((s) =>
      finish({
        shot: s.shot,
        takes: s.takes,
        generated_s: s.generated_s,
        kept_s: s.kept_s,
      }),
    ),
    by_take: byTake.map((t) =>
      finish({
        take: `${t.shot}/t${String(t.take).padStart(2, "0")}`,
        generated_s: t.generated_s,
        kept_s: t.kept_s,
      }),
    ),
    by_element: [...elements.values()]
      .sort((a, b) => cmp(a.element, b.element))
      .map(finish),
  };
}

// ── backward cascade: edits to an earlier phase's artifacts after a later phase's gate ──
export function backwardCascade({ phases, edits, ordered }) {
  const gateAt = (label) => {
    const hit = ordered.find(
      (e) => e.kind === "gate" && (e.gate ?? e.note) === label,
    );
    return hit ? Date.parse(hit.at) : null;
  };
  const times = phases.map((p) => (p.gate ? gateAt(p.gate) : null));
  const rows = phases.map((p, i) => {
    const later = times.slice(i + 1).filter((t) => t != null);
    const after = later.length ? Math.min(...later) : null;
    const hits =
      after == null
        ? []
        : edits.filter(
            (e) => e.ts > after && p.artifacts.some((a) => e.text.includes(a)),
          );
    return {
      phase: p.name,
      later_gate_at: after == null ? null : new Date(after).toISOString(),
      edits_after_later_gate: hits.length,
    };
  });
  return {
    edits: rows.reduce((n, r) => n + r.edits_after_later_gate, 0),
    by_phase: rows,
  };
}

// ── effort KPIs ─────────────────────────────────────────────────────────────────────────
const DECIDE = ["approval", "rejection", "gate", "quality", "idea"];

// Where the human's measured time went. A keyboard gap is classed by the events recorded
// between its start and the end of the turn it leads to: a correction makes it "correct",
// a decision event makes it "decide". Review time is "decide". Declared time is classed only
// when it was declared with a category. Whatever cannot be derived stays unclassified.
export function humanSplit({ gaps, reviewMs, declared, ordered }) {
  const out = {
    decide_ms: reviewMs,
    correct_ms: 0,
    chores_ms: 0,
    unclassified_ms: 0,
  };
  for (const g of gaps) {
    const kinds = ordered
      .filter((e) => Date.parse(e.at) >= g.start && Date.parse(e.at) <= g.until)
      .map((e) => e.kind);
    if (kinds.includes("correction")) out.correct_ms += g.keyboard_ms;
    else if (kinds.some((k) => DECIDE.includes(k)))
      out.decide_ms += g.keyboard_ms;
    else out.unclassified_ms += g.keyboard_ms;
  }
  for (const d of declared) {
    const ms = d.minutes * 60000;
    if (d.category === "decide") out.decide_ms += ms;
    else if (d.category === "correct") out.correct_ms += ms;
    else if (d.category === "chores") out.chores_ms += ms;
    else out.unclassified_ms += ms;
  }
  return {
    decide_s: secs(out.decide_ms),
    correct_s: secs(out.correct_ms),
    chores_s: secs(out.chores_ms),
    unclassified_s: secs(out.unclassified_ms),
  };
}

export function effortKpis({
  summary,
  aiMsByClass,
  finalDurationS,
  targets = {},
}) {
  const t = summary.time;
  const tok = summary.tokens;
  const human = t.human_total_s;
  const totalTokens = allTokens(tok.total);
  const tooling = tok.by_class.find((c) => c.class === "tooling");
  const aiMs = Object.values(aiMsByClass).reduce((a, b) => a + b, 0);
  const q = {
    quality_mean: summary.quality.mean,
    quality_n: summary.quality.n,
  };
  const kpi = (name, numerator, denominator, extra = {}) => {
    const row = {
      kpi: name,
      value: ratio(numerator, denominator),
      numerator: r4(numerator),
      denominator: r4(denominator),
      ...extra,
      ...q,
    };
    if (targets[name] != null) {
      row.target = targets[name];
      row.vs_target = row.value == null ? null : r4(row.value - targets[name]);
    }
    return row;
  };
  const minutes = finalDurationS == null ? 0 : finalDurationS / 60;
  return [
    kpi("ai_to_human_ratio", t.ai_s, human, {
      unit: "AI seconds per human second",
    }),
    kpi(
      "ai_to_human_ratio_with_subagents",
      t.ai_s + t.subagent_parallel_s,
      human,
      { unit: "AI + subagent seconds per human second" },
    ),
    kpi("tokens_per_human_minute", totalTokens, human / 60, {
      unit: "tokens (input, output, cache read, cache write) per minute",
    }),
    kpi("output_tokens_per_human_minute", tok.total.output_tokens, human / 60, {
      unit: "output tokens per minute",
    }),
    kpi("tooling_share_of_tokens", allTokens(tooling), totalTokens, {
      unit: "share",
    }),
    kpi(
      "tooling_share_of_ai_time",
      secs(aiMsByClass.tooling ?? 0),
      secs(aiMs),
      { unit: "share, a turn's AI time split by its responses" },
    ),
    kpi("cost_per_finished_minute", summary.spend.total_usd, minutes, {
      unit: "USD per minute of the final render",
    }),
    kpi("yield", summary.yield.kept, summary.yield.takes, {
      unit: "takes kept per take generated",
    }),
    kpi("rework_share_of_tokens", allTokens(tok.rework), totalTokens, {
      unit: "share",
    }),
  ];
}

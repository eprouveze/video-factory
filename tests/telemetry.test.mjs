import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addEvent,
  compareSummaries,
  loadRules,
  run,
} from "../scripts/telemetry.mjs";
import { addExtras, buildFixture } from "./fixtures/telemetry-fixture.mjs";
import { importEvents, runEdl, runQc } from "../scripts/telemetry.mjs";
import { listTakes, updateTake, writeTake } from "../scripts/take-record.mjs";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "telemetry.mjs");
const fresh = () => buildFixture(mkdtempSync(join(tmpdir(), "vf-tel-")));
const go = (fx, extra = {}) =>
  run({ project: fx.project, ...fx.sources, "plugin-sha": "testsha", ...extra });
const tokens = (i, o, cr, cc, th) => ({
  input_tokens: i,
  output_tokens: o,
  cache_read_input_tokens: cr,
  cache_creation_input_tokens: cc,
  thinking_tokens: th,
});
const pick = (row) =>
  tokens(
    row.input_tokens,
    row.output_tokens,
    row.cache_read_input_tokens,
    row.cache_creation_input_tokens,
    row.thinking_tokens,
  );
const fact = (r, n) =>
  r.facts.filter((f) => f.response === `msg-${n}|req-${n}`);

const fx = fresh();
const r = go(fx);
const s = r.summary;

test("one row per API response: lines that share a message id and request id are merged", () => {
  // response a1 is written as three lines; the first carries a smaller output count
  const rows = fact(r, "a1");
  assert.equal(rows.length, 1);
  assert.deepEqual(pick(rows[0]), tokens(100, 50, 1000, 200, 10));
  assert.equal(rows[0].tool_calls, 1);
  assert.equal(s.sources.duplicate_lines_merged, 7);
  // the mirror holds a stale copy of the same session file and a fork that repeats response m1
  assert.equal(fact(r, "m1").length, 1);
  assert.equal(s.sources.duplicate_responses_dropped, 1);
  assert.equal(s.sources.responses, 22);
  assert.deepEqual(pick(s.tokens.total), tokens(1466, 393, 20650, 700, 30));
  assert.equal(s.tokens.cache_hit_ratio, 0.9051);
});

test("a mixed response takes the majority class, and class_order breaks a tie", () => {
  assert.deepEqual(
    [fact(r, "a2")[0].class, fact(r, "a2")[0].class_rule],
    ["tooling", "plugin-repo"],
  );
  assert.deepEqual(
    [fact(r, "a3")[0].class, fact(r, "a3")[0].class_rule],
    ["content", "project-files"],
  );
  // no tool call: the class of the most recent classified response of the turn
  assert.deepEqual(
    [fact(r, "a4")[0].class, fact(r, "a4")[0].class_rule],
    ["content", "inherit-previous"],
  );
  const byClass = Object.fromEntries(
    s.tokens.by_class.map((c) => [c.class, c]),
  );
  assert.deepEqual(
    s.tokens.by_class.map((c) => c.class),
    ["tooling", "content", "overhead"],
  );
  assert.deepEqual(
    [byClass.tooling.responses, pick(byClass.tooling)],
    [1, tokens(10, 20, 2000, 0, 0)],
  );
  assert.deepEqual(
    [byClass.content.responses, pick(byClass.content)],
    [11, tokens(993, 237, 8500, 300, 20)],
  );
  assert.deepEqual(
    [byClass.overhead.responses, pick(byClass.overhead)],
    [10, tokens(463, 136, 10150, 400, 10)],
  );
});

test("a turn without tool calls inherits the previous turn, whichever way that went", () => {
  const a5 = fact(r, "a5")[0];
  assert.equal(a5.attribution_rule, "inherit");
  assert.deepEqual([a5.class, a5.class_rule], ["overhead", "default"]);
  assert.equal(a5.turn, "sess-a@2026-01-05T10:05:40.000Z");
  // turn 4 works elsewhere, turn 5 has no tool call: neither is counted
  assert.equal(fact(r, "a9").length, 0);
  assert.equal(fact(r, "a10").length, 0);
  // and a response outside the window is not counted either
  assert.equal(fact(r, "m-late").length, 0);
});

test("attribution by path, cwd, branch, document id and repository", () => {
  assert.equal(
    fact(r, "a1")[0].attribution_rule,
    "path:/work/demo/projects/demo",
  );
  assert.equal(
    fact(r, "m1")[0].attribution_rule,
    "cwd:/work/demo/projects/demo",
  );
  assert.equal(fact(r, "b1")[0].attribution_rule, "branch:demo-*");
  assert.equal(fact(r, "f1")[0].attribution_rule, "id:DOCID0001");
  assert.equal(fact(r, "m1")[0].host, "host-b");
  assert.equal(fact(r, "a1")[0].host, "host-a");
  const codex = r.facts.filter(
    (f) => f.harness === "codex" && f.session === "cdx1",
  );
  assert.deepEqual(
    codex.map((f) => f.attribution_rule),
    Array(3).fill("repo:example/demo-film"),
  );
});

test("a subagent inherits the turn that spawned it; without a link its own tool calls decide", () => {
  const s1 = fact(r, "s1")[0];
  assert.equal(s1.attribution_rule, "parent");
  assert.equal(s1.turn, "sess-a@2026-01-05T10:46:00.000Z");
  assert.equal(s1.sidechain, true);
  assert.equal(s1.agent, "agent-s1");
  assert.deepEqual(pick(s1), tokens(50, 5, 300, 0, 0));
  assert.equal(fact(r, "s2")[0].class_rule, "inherit-previous");
  assert.equal(
    fact(r, "s3")[0].attribution_rule,
    "path:/work/demo/projects/demo",
  );
  assert.equal(fact(r, "s4").length, 0);
  // spawned by a turn that is not project work, but it reads a project file itself
  const s5 = fact(r, "s5")[0];
  assert.equal(s5.attribution_rule, "path:/work/demo/projects/demo");
  assert.equal(s5.turn, "sess-a@2026-01-05T11:10:05.000Z");
  assert.equal(s.sources.subagent_transcripts, 3);
  // parallel time is reported on its own line, never added to AI time
  assert.equal(s.time.subagent_parallel_s, 55);
});

test("time: AI per turn, idle before a harness trigger, human gaps capped at 15 minutes", () => {
  assert.equal(s.time.turns, 10);
  assert.equal(s.time.human_turns, 7);
  assert.equal(s.time.ai_s, 237);
  // the wait for a background job is idle, and a hook line at 10:40 does not stretch turn 2
  assert.equal(s.time.ai_idle_s, 780);
  // gaps of 5, 40 and 10 minutes: 5 + 15 + 10 active, 25 away
  assert.equal(s.time.human_keyboard_s, 1800);
  assert.equal(s.time.away_s, 1500);
});

test("the idle cap comes from the rules file", () => {
  const other = fresh();
  const file = join(other.project, "telemetry", "rules.json");
  writeFileSync(
    file,
    JSON.stringify({
      ...JSON.parse(readFileSync(file, "utf8")),
      idle_cap_minutes: 5,
    }),
  );
  const t = go(other).summary.time;
  assert.equal(t.human_keyboard_s, 900);
  assert.equal(t.away_s, 2400);
});

test("codex rollouts: per-response records, cached input split out, no double count", () => {
  const rows = Object.fromEntries(
    s.tokens.by_model_harness.map((x) => [`${x.model} ${x.harness}`, x]),
  );
  assert.deepEqual(Object.keys(rows), [
    "codex-model-x codex",
    "codex-model-y codex",
    "model-a claude-code",
    "model-b claude-code",
    "unknown agy",
  ]);
  assert.deepEqual(
    [rows["codex-model-x codex"].responses, pick(rows["codex-model-x codex"])],
    [3, tokens(700, 120, 2800, 0, 15)],
  );
  // token_count only: the empty and the repeated count are skipped
  assert.deepEqual(
    [rows["codex-model-y codex"].responses, pick(rows["codex-model-y codex"])],
    [1, tokens(400, 10, 100, 0, 0)],
  );
  assert.deepEqual(
    [rows["model-a claude-code"].responses, pick(rows["model-a claude-code"])],
    [12, tokens(288, 248, 17750, 300, 15)],
  );
  assert.deepEqual(
    [rows["model-b claude-code"].responses, pick(rows["model-b claude-code"])],
    [4, tokens(78, 15, 0, 400, 0)],
  );
  // agy logs carry no usage: the responses are counted, the tokens are not invented
  assert.deepEqual(
    [rows["unknown agy"].responses, pick(rows["unknown agy"])],
    [2, tokens(0, 0, 0, 0, 0)],
  );
  assert.ok(
    r.facts
      .filter((f) => f.harness === "agy")
      .every((f) => f.usage_reported === false && f.class === "content"),
  );
  const cdx = r.facts
    .filter((f) => f.session === "cdx1")
    .map((f) => [f.class, f.class_rule]);
  assert.deepEqual(cdx, [
    ["content", "project-files"],
    ["overhead", "default"],
    ["overhead", "inherit-previous"],
  ]);
  assert.deepEqual(
    r.facts.filter((f) => f.session === "cdx2").map((f) => f.class_rule),
    ["in-project-dir"],
  );
});

test("paid spend and yield come from take records only", () => {
  assert.equal(s.spend.total_usd, 1.8);
  assert.equal(s.spend.takes_without_cost, 1);
  assert.deepEqual(s.spend.by_provider_model, [
    {
      provider: null,
      model: "clip-x",
      takes: 3,
      takes_without_cost: 1,
      usd: 0.8,
    },
    {
      provider: "prov-a",
      model: "clip-y",
      takes: 1,
      takes_without_cost: 0,
      usd: 1,
    },
  ]);
  assert.deepEqual(s.yield.by_shot, [
    { shot: "S001", takes: 2, kept: 1, ratio: 0.5 },
    { shot: "S002", takes: 1, kept: 1, ratio: 1 },
    { shot: "S003", takes: 1, kept: 0, ratio: 0 },
  ]);
  assert.deepEqual([s.yield.takes, s.yield.kept, s.yield.ratio], [4, 2, 0.5]);
});

test("operator events: counts, lead time per gate, waiting time, declared time kept apart", () => {
  assert.deepEqual(s.events.by_kind, {
    correction: 1,
    rejection: 1,
    approval: 1,
    gate: 2,
    waiting: 2,
    idea: 0,
    review: 0,
    quality: 0,
  });
  assert.deepEqual(
    s.events.gates.map((g) => [g.gate, g.since_previous_s]),
    [
      ["G1", null],
      ["G2", 10800],
    ],
  );
  assert.deepEqual(
    [
      s.events.waiting.total_s,
      s.events.waiting.resolved,
      s.events.waiting.open,
    ],
    [900, 1, 1],
  );
  assert.equal(s.time.declared_minutes, 75);
  assert.equal(s.time.declared.length, 2);
  assert.match(r.text, /declared \(not measured\)\s+1h15m00s/);
  assert.throws(
    () => addEvent(fx.project, { kind: "praise", note: "x" }),
    /kind must be one of/,
  );
  assert.throws(
    () => addEvent(fx.project, { kind: "gate", note: "x", at: "yesterday" }),
    /not an ISO time/,
  );
});

test("rework: tokens of responses whose tool calls touched only dropped artifacts", () => {
  assert.deepEqual(
    [s.tokens.rework.responses, pick(s.tokens.rework)],
    [1, tokens(10, 60, 2500, 100, 0)],
  );
  assert.deepEqual(
    r.facts.filter((f) => f.rework).map((f) => f.response),
    ["msg-a7|req-a7"],
  );
});

test("deterministic: two runs, and a run on a second copy of the logs, give the same bytes", () => {
  const read = (dir) =>
    ["facts.jsonl", "summary.json"].map((f) => readFileSync(join(dir, f)));
  const first = read(r.out);
  const again = go(fx, { out: mkdtempSync(join(tmpdir(), "vf-tel-out-")) });
  const elsewhere = go(fresh());
  for (const other of [again, elsewhere]) {
    const bytes = read(other.out);
    assert.ok(first[0].equals(bytes[0]), "facts.jsonl differs");
    assert.ok(first[1].equals(bytes[1]), "summary.json differs");
    assert.equal(other.text, r.text);
  }
  assert.ok(first[0].length > 0);
  const sorted = [...r.facts].sort((a, b) =>
    a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0,
  );
  assert.deepEqual(
    r.facts.map((f) => f.ts),
    sorted.map((f) => f.ts),
  );
});

test("the CLI prints the same table, and compare lines up a baseline", () => {
  const args = (out, extra = []) => [
    SCRIPT,
    "run",
    "--project",
    fx.project,
    "--claude",
    fx.sources.claude[0],
    "--mirror",
    fx.sources.mirror[0],
    "--codex",
    fx.sources.codex[0],
    "--host",
    "host-a",
    "--home",
    "/home/nobody",
    "--plugin-sha",
    "testsha",
    "--out",
    out,
    ...extra,
  ];
  const outA = mkdtempSync(join(tmpdir(), "vf-tel-a-"));
  const outB = mkdtempSync(join(tmpdir(), "vf-tel-b-"));
  assert.equal(execFileSync("node", args(outA), { encoding: "utf8" }), r.text);
  // baseline: the same rules over a narrower window
  execFileSync(
    "node",
    args(outB, ["--to", "2026-01-05T11:00:00Z", "--quiet"]),
    { encoding: "utf8" },
  );
  const b = JSON.parse(readFileSync(join(outB, "summary.json"), "utf8"));
  assert.equal(b.sources.responses, 10);
  assert.equal(b.events.by_kind.gate, 1);
  const cmpText = execFileSync(
    "node",
    [SCRIPT, "compare", join(outA, "summary.json"), join(outB, "summary.json")],
    { encoding: "utf8" },
  );
  assert.equal(cmpText, compareSummaries(s, b));
  assert.match(cmpText, /^sources\.responses\s+22\s+10\s+-12\s+0\.4545$/m);
  assert.match(
    cmpText,
    /^tokens\.by_class\[tooling\]\.output_tokens\s+20\s+20\s+0\s+1$/m,
  );
});

test("the shipped example rules file loads, comments and all", () => {
  const rules = loadRules(
    join(ROOT, "examples", "telemetry-rules.example.json"),
    { home: "/home/nobody" },
  );
  assert.deepEqual(rules.class_order, ["tooling", "content", "overhead"]);
  assert.ok(
    rules.attribution.path_prefixes.includes(
      "/home/nobody/video/projects/demo",
    ),
  );
  assert.equal(rules.idle_cap_ms, 15 * 60000);
  assert.throws(() => {
    const bad = join(mkdtempSync(join(tmpdir(), "vf-tel-r-")), "rules.json");
    writeFileSync(
      bad,
      JSON.stringify({
        attribution: { ids: ["x"] },
        class_order: ["a"],
        default_class: "b",
        classes: [],
      }),
    );
    loadRules(bad);
  }, /default_class/);
});

// ── additions: idea ledger, quality tap, review, effort KPIs, EDL, cascade, QC, outcome ──
const fx2 = addExtras(fresh());
const r2 = go(fx2);
const s2 = r2.summary;
const kpi = (sum, name) => sum.kpis.find((k) => k.kpi === name);
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

test("event import validates every line first, and can be run again", () => {
  assert.deepEqual(fx2.imported, { lines: 12, imported: 12, skipped: 0 });
  assert.deepEqual(importEvents(fx2.project, fx2.backfill), { lines: 12, imported: 0, skipped: 12 });
  const events = join(fx2.project, "telemetry", "events.jsonl");
  const before = readFileSync(events);
  const bad = join(fx2.project, "bad.jsonl");
  const ok = { kind: "idea", element: "x", origin: "human", proposer: "human", labelled_by: "human", source: "doc", at: "2026-01-05T09:00:00Z" };
  for (const [line, why] of [
    [{ ...ok, origin: "robot" }, /line 2: origin must be one of/],
    [{ ...ok, labelled_by: undefined }, /line 2: labelled_by must be one of/],
    [{ ...ok, proposer: "nobody" }, /line 2: proposer must be one of/],
    [{ ...ok, dropped_origin: "human" }, /dropped_origin only goes with origin dropped/],
    [{ ...ok, colour: "red" }, /unknown field for a idea event: colour/],
    [{ ...ok, at: undefined }, /line 2: at is required/],
    [{ kind: "quality", artifact: "a", score: 6, at: ok.at }, /score must be an integer from 1 to 5/],
    [{ kind: "quality", artifact: "a", score: 3, labelled_by: "agent", at: ok.at }, /labelled by a human/],
  ]) {
    writeFileSync(bad, [ok, line].map((x) => JSON.stringify(x)).join("\n"));
    assert.throws(() => importEvents(fx2.project, bad), why);
  }
  assert.ok(before.equals(readFileSync(events)), "a refused import wrote something");
});

test("idea ledger: the latest event wins, a dropped element keeps its origin", () => {
  const c = s2.creativity;
  const led = Object.fromEntries(c.ledger.map((x) => [x.element, x]));
  assert.deepEqual([c.elements, c.live, c.dropped], [8, 5, 3]);
  assert.deepEqual([led["title card"].origin, led["title card"].dropped_origin], ["dropped", "ai-chosen"]);
  // superseded by a later element: dropped, and it remembers what it was
  assert.deepEqual(
    [led.ending.origin, led.ending.dropped_origin, led.ending.superseded_by],
    ["dropped", "human-seeded-ai-developed", "new ending"],
  );
  assert.deepEqual(c.by_origin.map((o) => [o.origin, o.count, o.of, o.share]), [
    ["human", 2, 5, 0.4],
    ["ai-chosen", 1, 5, 0.2],
    ["human-seeded-ai-developed", 0, 5, 0],
    ["ai-seeded-human-developed", 1, 5, 0.2],
    ["real-system", 1, 5, 0.2],
  ]);
  // kept AI proposals over kept + dropped AI proposals; the dropped human-proposed one is not in it
  assert.deepEqual(c.ai_acceptance, { accepted: 2, ai_proposed_dropped: 2, numerator: 2, denominator: 4, rate: 0.5 });
  assert.deepEqual(c.options_offered, { decisions: 3, options: 9, mean: 3 });
  assert.equal(c.surprise_declared, 1);
  // "title card" came back once after being dropped
  assert.equal(c.reproposals, 1);
  const by = Object.fromEntries(c.by_labelled_by.map((b) => [b.labelled_by, b]));
  assert.deepEqual([by.human.elements, by.human.live, by.human.ai_acceptance.numerator, by.human.ai_acceptance.denominator], [5, 3, 1, 2]);
  assert.deepEqual([by.agent.elements, by.agent.live, by.agent.ai_acceptance.numerator, by.agent.ai_acceptance.denominator], [3, 2, 1, 2]);
  assert.deepEqual([by.agent.options_offered.options, by.agent.options_offered.decisions], [5, 2]);
  assert.match(r2.text, /surprise \(declared\)/);
  assert.equal(s2.events.by_kind.idea, 11);
});

test("quality tap: distribution per gate, and the skip rule", () => {
  const q = s2.quality;
  assert.deepEqual([q.n, q.sum, q.mean], [4, 14, 3.5]);
  assert.deepEqual(q.by_gate.map((g) => [g.gate, g.n, g.mean]), [["(no gate)", 1, 3], ["G1", 2, 3], ["G2", 1, 5]]);
  assert.deepEqual(q.by_gate[1].scores, { score_1: 0, score_2: 1, score_3: 0, score_4: 1, score_5: 0 });
  // 6 gates, 4 of them without a tap: over 30% after at least 5 gates
  assert.deepEqual(q.skip, { gates: 6, skipped: 4, numerator: 4, denominator: 6, share: 0.6667, retire: true });
  assert.match(r2.text, /^QUALITY TAP: skipped >30%, retire per rule$/m);
  // the first project has 2 gates and no tap: too few gates to judge
  assert.deepEqual([s.quality.skip.skipped, s.quality.skip.gates, s.quality.skip.retire], [2, 2, false]);
  assert.doesNotMatch(r.text, /QUALITY TAP/);
  // every KPI row carries the quality it is paired with
  assert.ok(s2.kpis.every((k) => k.quality_mean === 3.5 && k.quality_n === 4));
});

test("human time: keyboard + review + declared, and a reviewed gap is not capped", () => {
  const t = s2.time;
  // the 40 minute gap holds a 20 minute review: 20 minutes of review, 20 at the keyboard, none away
  assert.deepEqual([t.human_keyboard_s, t.human_review_s, t.declared_minutes, t.human_total_s, t.away_s], [2100, 1200, 85, 8400, 0]);
  assert.deepEqual(t.split, { decide_s: 1800, correct_s: 1200, chores_s: 600, unclassified_s: 4800 });
  // without events to class them, the time is left out rather than guessed
  assert.deepEqual(s.time.split, { decide_s: 0, correct_s: 900, chores_s: 0, unclassified_s: 5400 });
  assert.equal(s.time.human_total_s, 6300);
});

test("effort KPIs: every ratio comes with its numerator and denominator, targets only when set", () => {
  const row = (name) => {
    const k = kpi(s2, name);
    return [k.value, k.numerator, k.denominator];
  };
  assert.deepEqual(row("ai_to_human_ratio"), [0.0282, 237, 8400]);
  assert.deepEqual(row("ai_to_human_ratio_with_subagents"), [0.0348, 292, 8400]);
  assert.deepEqual(row("tokens_per_human_minute"), [165.7786, 23209, 140]);
  assert.deepEqual(row("output_tokens_per_human_minute"), [2.8071, 393, 140]);
  assert.deepEqual(row("tooling_share_of_tokens"), [0.0875, 2030, 23209]);
  assert.deepEqual(row("tooling_share_of_ai_time"), [0.0422, 10, 237]);
  assert.deepEqual(row("yield"), [0.3333, 2, 6]);
  assert.deepEqual(row("rework_share_of_tokens"), [0.115, 2670, 23209]);
  // no final video in the rules: the figure is absent, not invented
  assert.deepEqual(row("cost_per_finished_minute"), [null, 2.1, 0]);
  assert.deepEqual([kpi(s2, "yield").target, kpi(s2, "yield").vs_target], [0.6, -0.2667]);
  assert.deepEqual([kpi(s2, "ai_to_human_ratio").target, kpi(s2, "ai_to_human_ratio").vs_target], [0.05, -0.0218]);
  assert.ok(!("target" in kpi(s2, "tokens_per_human_minute")));
  assert.ok(s.kpis.every((k) => !("target" in k)));
});

test("take records: reason on reject, failed calls, lineage and the plugin commit", () => {
  const takes = listTakes(join(fx2.project, "takes"), "S004");
  assert.deepEqual(
    [takes[0].verdict, takes[0].status, takes[0].request_id, takes[0].retries, takes[0].billed_usd, takes[0].provider],
    ["failed", "failed", "req-123", 2, 0.1, "prov-a"],
  );
  const dropped = listTakes(join(fx2.project, "takes"), "S005")[0];
  assert.equal(dropped.reason, "continuity");
  assert.match(dropped.result_sha256, /^[0-9a-f]{64}$/);
  assert.match(dropped.prompt_sha256, /^[0-9a-f]{64}$/);
  assert.ok("plugin_sha" in dropped);
  const dir = join(fx2.project, "takes");
  const input = { shot_id: "S006", model: "clip-x", resolution: "768p", duration_s: 5, prompt_file: join(fx2.project, "prompt.txt") };
  assert.throws(() => writeTake(dir, { ...input, verdict: "redo" }), /verdict redo needs --reason/);
  assert.throws(() => writeTake(dir, { ...input, verdict: "dropped", reason: "mood" }), /reason must be one of/);
  assert.throws(() => updateTake(dir, "S003", 1, { verdict: "redo" }), /needs --reason/);
  assert.equal(listTakes(dir, "S006").length, 0);
  // a failed call counts in spend (the billed amount) and in the yield denominator
  assert.equal(s2.spend.total_usd, 2.1);
  assert.deepEqual(s2.spend.by_provider_model.map((x) => [x.provider, x.model, x.takes, x.usd]), [
    [null, "clip-x", 4, 1],
    ["prov-a", "clip-y", 2, 1.1],
  ]);
  assert.deepEqual([s2.yield.takes, s2.yield.kept, s2.yield.failed, s2.yield.thrown_away], [6, 2, 1, 2]);
  assert.deepEqual(s2.yield.by_reason.map((x) => [x.reason, x.takes, x.of]), [
    ["taste", 0, 2], ["continuity", 1, 2], ["technical", 0, 2], ["cost", 0, 2], ["unspecified", 1, 2],
  ]);
});

test("EDL survival: seconds generated against seconds kept, per shot, take and element", () => {
  const e = s2.edl_survival;
  assert.deepEqual([e.generated_s, e.kept_s, e.ratio, e.unmatched_rows, e.unmatched_s], [25, 5.5, 0.22, 1, 1]);
  assert.deepEqual(e.by_shot.slice(0, 2), [
    { shot: "S001", takes: 2, generated_s: 10, kept_s: 3, ratio: 0.3 },
    { shot: "S002", takes: 1, generated_s: 5, kept_s: 2.5, ratio: 0.5 },
  ]);
  assert.deepEqual(e.by_take.find((t) => t.take === "S001/t02"), { take: "S001/t02", generated_s: 5, kept_s: 3, ratio: 0.6 });
  // a failed call generated nothing
  assert.deepEqual(e.by_take.find((t) => t.take === "S004/t01"), { take: "S004/t01", generated_s: 0, kept_s: 0, ratio: null });
  assert.deepEqual(e.by_element, [
    { element: "color palette", generated_s: 5, kept_s: 2.5, ratio: 0.5 },
    { element: "opening shot", generated_s: 15, kept_s: 5.5, ratio: 0.3667 },
  ]);
  assert.deepEqual(runEdl({ project: fx2.project }), e);
});

test("backward cascade and version stamps", () => {
  assert.deepEqual(s2.cascade, {
    edits: 1,
    by_phase: [
      { phase: "drafts", later_gate_at: "2026-01-05T09:00:00.000Z", edits_after_later_gate: 1 },
      { phase: "cut-list", later_gate_at: "2026-01-05T12:00:00.000Z", edits_after_later_gate: 0 },
      { phase: "stills", later_gate_at: null, edits_after_later_gate: 0 },
    ],
  });
  assert.ok(!("cascade" in s));
  assert.ok(r2.facts.every((f) => f.plugin_sha === "testsha"));
  assert.deepEqual(s2.versions, {
    plugin_sha: "testsha",
    harnesses: [
      { harness: "agy", harness_version: null },
      { harness: "claude-code", harness_version: "9.9.9" },
      { harness: "codex", harness_version: null },
      { harness: "codex", harness_version: "0.0.1" },
    ],
  });
});

test("outcome: fixed windows from the publish date, an unfinished window has no numbers", () => {
  const p = fresh();
  const input = join(p.project, "yt.json");
  const seven = { views: 120, averageViewDuration: 61, averageViewPercentage: 48.5, likes: 9, comments: 2, subscribersGained: 1 };
  writeFileSync(input, JSON.stringify({ published_at: "2026-01-05T10:00:00Z", reports: { "publish+7d": seven, "publish+28d": { ...seven, views: 300 } } }));
  const yt = (asOf) => {
    const res = spawnSync("python3", [join(ROOT, "scripts", "yt_analytics.py"), "--video-id", "vid123", "--project", p.project, "--from-json", input, "--as-of", asOf], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    return JSON.parse(readFileSync(join(p.project, "telemetry", "outcome.json"), "utf8"));
  };
  // on the 15th the 7 day window is still inside the lag: no numbers at all
  assert.deepEqual(yt("2026-01-15").windows.map((w) => [w.status, w.metrics]), [["incomplete", null], ["incomplete", null]]);
  // 12 January + 3 days of lag is over on the 20th; 2 February is not
  const early = yt("2026-01-20");
  assert.deepEqual(early.windows.map((w) => [w.window, w.start, w.end, w.status]), [
    ["publish+7d", "2026-01-05", "2026-01-12", "complete"],
    ["publish+28d", "2026-01-05", "2026-02-02", "incomplete"],
  ]);
  assert.deepEqual(early.windows[0].metrics, seven);
  assert.equal(early.windows[1].metrics, null);
  const sumEarly = go(p).summary;
  assert.deepEqual(sumEarly.outcome, yt("2026-01-20"));
  const late = yt("2026-03-01");
  assert.deepEqual(late.windows[0], early.windows[0]);
  assert.equal(late.windows[1].metrics.views, 300);
  // compare covers the outcome too
  const text = compareSummaries(sumEarly, go(p).summary);
  assert.match(text, /^outcome\.windows\[publish\+7d\/2026-01-05\/2026-01-12\/complete\]\.metrics\.views\s+120\s+120\s+0\s+1$/m);
  assert.match(text, /^outcome\.windows\[publish\+28d\/2026-01-05\/2026-02-02\/complete\]\.metrics\.views\s+-\s+300/m);
  assert.match(go(p).text, /OUTCOME \(after publication\)/);
});

test("render QC and cost per finished minute, on a generated two-second video", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const p = addExtras(fresh());
  const video = join(p.project, "final.mp4");
  const made = spawnSync("ffmpeg", [
    "-v", "error", "-y", "-f", "lavfi", "-i", "color=black:s=160x120:r=25:d=1", "-f", "lavfi", "-i", "testsrc=s=160x120:r=25:d=1",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
    "-map", "[v]", "-map", "2:a", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", video,
  ]);
  assert.equal(made.status, 0, String(made.stderr));
  const rulesFile = join(p.project, "telemetry", "rules.json");
  writeFileSync(rulesFile, JSON.stringify({ ...JSON.parse(readFileSync(rulesFile, "utf8")), final_video: "final.mp4" }));
  const qc = runQc({ project: p.project });
  const bytes = readFileSync(join(p.project, "telemetry", "render-qc.json"));
  assert.match(qc.ffmpeg_version, /^ffmpeg version/);
  assert.match(qc.file_sha256, /^[0-9a-f]{64}$/);
  assert.ok(Math.abs(qc.duration_s - 2) < 0.2, `duration ${qc.duration_s}`);
  assert.equal(typeof qc.loudness_lufs, "number");
  assert.ok(qc.black.count >= 1 && qc.black.total_s > 0.5, JSON.stringify(qc.black));
  assert.ok(qc.freeze.count >= 1, JSON.stringify(qc.freeze));
  assert.deepEqual([qc.black.min_s, qc.black.pix_th, qc.freeze.noise_db, qc.freeze.min_s], [0.1, 0.05, -60, 0.22]);
  runQc({ project: p.project });
  assert.ok(bytes.equals(readFileSync(join(p.project, "telemetry", "render-qc.json"))), "render-qc.json differs between two runs");
  const sum = go(p).summary;
  assert.deepEqual(sum.render_qc, qc);
  const k = kpi(sum, "cost_per_finished_minute");
  assert.equal(sum.final_render.duration_s, qc.duration_s);
  assert.deepEqual([k.numerator, k.denominator], [2.1, Math.round((qc.duration_s / 60) * 1e4) / 1e4]);
  assert.ok(Math.abs(k.value - 2.1 / (qc.duration_s / 60)) < 0.01);
  assert.match(go(p).text, /RENDER QC \(ffmpeg version/);
});

test("the additions are deterministic too", () => {
  const again = go(addExtras(fresh()));
  assert.equal(again.text, r2.text);
  for (const f of ["facts.jsonl", "summary.json"]) {
    assert.ok(readFileSync(join(r2.out, f)).equals(readFileSync(join(again.out, f))), `${f} differs`);
  }
  assert.ok(existsSync(join(r2.out, "summary.json")));
});

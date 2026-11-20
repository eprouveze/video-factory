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
import { buildFixture } from "./fixtures/telemetry-fixture.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "telemetry.mjs");
const fresh = () => buildFixture(mkdtempSync(join(tmpdir(), "vf-tel-")));
const go = (fx, extra = {}) =>
  run({ project: fx.project, ...fx.sources, ...extra });
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
  assert.equal(s.time.human_active_s, 1800);
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
  assert.equal(t.human_active_s, 900);
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
    /--kind must be one of/,
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

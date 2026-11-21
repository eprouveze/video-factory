// Synthetic logs for tests/telemetry.test.mjs. Every path, id and model name is made up.
// buildFixture(root) writes: claude/ (main + subagent transcripts), mirror/ (another host:
// Claude-format and agy-converted), codex/ (two rollouts), project/ (rules, takes, events).
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { addEvent, addTime, importEvents } from "../../scripts/telemetry.mjs";
import { writeTake } from "../../scripts/take-record.mjs";

export const PROJECT = "/work/demo/projects/demo";
const T = (hms, day = "05") => `2026-01-${day}T${hms}.000Z`;
const U = (i, o, cr, cc, th) => ({
  input_tokens: i,
  output_tokens: o,
  cache_read_input_tokens: cr,
  cache_creation_input_tokens: cc,
  output_tokens_details: { thinking_tokens: th },
});
const tool = (id, name, input) => ({ type: "tool_use", id, name, input });
const text = (t) => ({ type: "text", text: t });

function writeJsonl(file, rows) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, rows.map((r) => JSON.stringify(r) + "\n").join(""));
}

// One session's line factory. Claude Code writes one line per content block, all with the
// same message id, request id and usage: `reply` reproduces that.
function session(
  id,
  {
    cwd = "/work/other",
    branch = "main",
    sidechain = false,
    model = "model-a",
  } = {},
) {
  const base = {
    version: "9.9.9",
    sessionId: id,
    cwd,
    gitBranch: branch,
    isSidechain: sidechain,
  };
  return {
    human: (at, content) => ({
      ...base,
      type: "user",
      timestamp: T(at),
      origin: { kind: "human" },
      message: { role: "user", content },
    }),
    prompt: (at, content) => ({
      ...base,
      type: "user",
      timestamp: T(at),
      message: { role: "user", content },
    }),
    notice: (at) => ({
      ...base,
      type: "user",
      timestamp: T(at),
      origin: { kind: "task-notification" },
      message: {
        role: "user",
        content: "<task-notification>background job done</task-notification>",
      },
    }),
    result: (at, toolUseId) => ({
      ...base,
      type: "user",
      timestamp: T(at),
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: toolUseId, content: "ok" },
        ],
      },
    }),
    hook: (at) => ({
      ...base,
      type: "attachment",
      timestamp: T(at),
      attachment: { type: "hook", hookName: "SessionStart" },
    }),
    reply: (at, n, usage, blocks, { day = "05", firstOutput } = {}) =>
      blocks.map((block, i) => ({
        ...base,
        type: "assistant",
        timestamp: T(at, day),
        requestId: `req-${n}`,
        message: {
          id: `msg-${n}`,
          role: "assistant",
          model,
          content: [block],
          usage:
            i === 0 && firstOutput != null
              ? { ...usage, output_tokens: firstOutput }
              : usage,
        },
      })),
  };
}

export function buildFixture(root) {
  const claude = join(root, "claude");
  const mirror = join(root, "mirror");
  const codex = join(root, "codex");
  const project = join(root, "project");

  // ── session A: cwd outside the project, so every turn is attributed by its tool calls ──
  const a = session("sess-a");
  const sessA = [
    a.hook("09:59:00"),
    // turn 1
    a.human("10:00:00", "start the cut list"),
    ...a.reply(
      "10:00:10",
      "a1",
      U(100, 50, 1000, 200, 10),
      [
        { type: "thinking", thinking: "" },
        text("reading"),
        tool("tu-a1", "Read", { file_path: `${PROJECT}/manifest.json` }),
      ],
      { firstOutput: 1 },
    ),
    a.result("10:00:12", "tu-a1"),
    // mixed: two tooling calls against one overhead call
    ...a.reply("10:00:20", "a2", U(10, 20, 2000, 0, 0), [
      tool("tu-a2a", "Edit", { file_path: "/work/plugin/scripts/x.mjs" }),
      tool("tu-a2b", "Bash", { command: "git status" }),
      tool("tu-a2c", "Edit", { file_path: "/work/plugin/scripts/y.mjs" }),
    ]),
    a.result("10:00:22", "tu-a2a"),
    // mixed, tied: content against overhead, class_order decides
    ...a.reply("10:00:30", "a3", U(10, 30, 2100, 0, 0), [
      tool("tu-a3a", "Bash", { command: "git log -1" }),
      tool("tu-a3b", "Read", { file_path: `${PROJECT}/edl.json` }),
    ]),
    a.result("10:00:32", "tu-a3a"),
    ...a.reply("10:00:40", "a4", U(10, 40, 2200, 0, 5), [text("done")]),
    // turn 2, five minutes later, no tool call at all: inherits the project from turn 1
    a.human("10:05:40", "thanks, why that order?"),
    ...a.reply("10:06:00", "a5", U(5, 10, 2300, 0, 0), [text("because")]),
    // a hook line written when the session is reopened: not activity
    a.hook("10:40:00"),
    // turn 3, forty minutes later: spawns a subagent, rewrites a dropped file, waits on a job
    a.human("10:46:00", [text("continue"), { type: "image", source: {} }]),
    ...a.reply("10:46:05", "a6", U(10, 10, 2400, 0, 0), [
      tool("tu-spawn1", "Agent", {
        description: "look",
        prompt: "look at things",
      }),
    ]),
    ...a.reply("10:46:30", "a7", U(10, 60, 2500, 100, 0), [
      tool("tu-a7", "Write", {
        file_path: `${PROJECT}/drafts/old.txt`,
        content: "x",
      }),
    ]),
    a.result("10:47:00", "tu-a7"),
    a.notice("11:00:00"),
    ...a.reply("11:00:05", "a8", U(10, 5, 2600, 0, 0), [
      tool("tu-a8", "Bash", { command: "git commit -m x" }),
    ]),
    // turn 4: other work, must not be counted
    a.human("11:10:05", "now the other thing"),
    ...a.reply("11:10:10", "a9", U(999, 999, 999, 999, 999), [
      tool("tu-a9", "Read", { file_path: "/work/elsewhere/notes.txt" }),
      tool("tu-spawn2", "Agent", { description: "check", prompt: "check" }),
    ]),
    // turn 5: no tool call, inherits "not this project" from turn 4
    a.human("11:20:00", "ok"),
    ...a.reply("11:20:05", "a10", U(888, 888, 888, 888, 888), [text("ok")]),
  ];
  writeJsonl(join(claude, "-work-other", "sess-a.jsonl"), sessA);

  // subagent 1: nothing of its own points at the project; linked to turn 3 by its meta file
  const sub = session("sess-a", { sidechain: true });
  const subs = join(claude, "-work-other", "sess-a", "subagents");
  writeJsonl(join(subs, "agent-s1.jsonl"), [
    sub.prompt("10:46:10", "look at things"),
    ...sub.reply("10:46:20", "s1", U(50, 5, 300, 0, 0), [
      text("looking"),
      tool("tu-s1", "Read", { file_path: "/work/unrelated/a.txt" }),
    ]),
    sub.result("10:46:25", "tu-s1"),
    ...sub.reply("10:46:50", "s2", U(50, 15, 350, 0, 0), [text("found")]),
  ]);
  writeFileSync(
    join(subs, "agent-s1.meta.json"),
    JSON.stringify({ agentType: "general-purpose", toolUseId: "tu-spawn1" }),
  );
  // subagent 2: no meta file, attributed by its own tool call
  writeJsonl(join(subs, "agent-s2.jsonl"), [
    sub.prompt("10:46:12", "list refs"),
    ...sub.reply("10:46:22", "s3", U(20, 2, 0, 0, 0), [
      tool("tu-s3", "Read", { file_path: `${PROJECT}/refs/list.txt` }),
    ]),
  ]);
  // subagent 4: spawned by turn 4, which is not project work, but it reads a project file itself
  writeJsonl(join(subs, "agent-s4.jsonl"), [
    sub.prompt("11:10:12", "check"),
    ...sub.reply("11:10:17", "s5", U(3, 1, 0, 0, 0), [
      tool("tu-s5", "Read", { file_path: `${PROJECT}/refs/x.txt` }),
    ]),
  ]);
  writeFileSync(
    join(subs, "agent-s4.meta.json"),
    JSON.stringify({ toolUseId: "tu-spawn2" }),
  );
  // subagent 3: its parent call is unknown and it never touches the project
  writeJsonl(join(subs, "agent-s3.jsonl"), [
    sub.prompt("10:46:14", "unrelated"),
    ...sub.reply("10:46:24", "s4", U(777, 777, 777, 777, 777), [
      tool("tu-s4", "Read", { file_path: "/work/elsewhere/b.txt" }),
    ]),
  ]);
  writeFileSync(
    join(subs, "agent-s3.meta.json"),
    JSON.stringify({ toolUseId: "tu-missing" }),
  );

  // ── mirror of another host ──
  const hostB = join(mirror, "host-b", "claude");
  // a stale copy of session A: same file name as the local one, so it is not read twice
  writeJsonl(join(hostB, "-work-other", "sess-a.jsonl"), sessA.slice(0, 6));
  // attributed by cwd; one response is outside the window
  const m = session("sess-m", { cwd: PROJECT, model: "model-b" });
  const m1 = m.reply("12:00:10", "m1", U(30, 3, 0, 400, 0), [
    tool("tu-m1", "mcp__memory__recall", { query: "what did we decide" }),
  ]);
  writeJsonl(join(hostB, "-work-demo", "sess-m.jsonl"), [
    m.human("12:00:00", "recall"),
    ...m1,
    ...m.reply(
      "12:00:00",
      "m-late",
      U(5000, 5000, 5000, 5000, 5000),
      [text("two days later")],
      { day: "07" },
    ),
  ]);
  // a forked session: it carries a copy of response m1, then is attributed by a document id
  const f = session("sess-fork", { cwd: "/work/third", model: "model-b" });
  writeJsonl(join(hostB, "-work-third", "sess-fork.jsonl"), [
    ...m1.map((line) => ({
      ...line,
      sessionId: "sess-fork",
      cwd: "/work/third",
    })),
    f.human("12:30:00", "open the doc"),
    ...f.reply("12:30:20", "f1", U(40, 4, 0, 0, 0), [
      tool("tu-f1", "mcp__drive__read_file_content", { fileId: "DOCID0001" }),
    ]),
  ]);
  // attributed by git branch only
  const b = session("sess-br", {
    cwd: "/work/third",
    branch: "demo-cut2",
    model: "model-b",
  });
  writeJsonl(join(hostB, "-work-third", "sess-br.jsonl"), [
    b.human("13:00:00", "status?"),
    ...b.reply("13:00:30", "b1", U(7, 7, 0, 0, 0), [text("fine")]),
  ]);
  // a session driven by another agent: its opening message is not a person's
  const tm = session("sess-team", { cwd: PROJECT, model: "model-b" });
  writeJsonl(join(hostB, "-work-demo", "sess-team.jsonl"), [
    tm.prompt("13:30:00", '<teammate-message teammate_id="lead">do the thing</teammate-message>'),
    ...tm.reply("13:30:10", "t1", U(1, 1, 0, 0, 0), [text("done")]),
  ]);
  // agy converted to the Claude shape: no ids, no model, no usage
  writeJsonl(join(mirror, "host-b", "agy-converted", "agy-sess-g.jsonl"), [
    {
      type: "user",
      timestamp: T("14:00:00"),
      message: { role: "user", content: "list the refs" },
    },
    {
      type: "assistant",
      timestamp: T("14:00:05"),
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "run_command",
            input: { toolAction: `ls ${PROJECT}/refs`, toolSummary: "list" },
          },
        ],
      },
    },
    {
      type: "user",
      timestamp: T("14:00:06"),
      message: {
        role: "user",
        content: [{ type: "tool_result", content: "a.png" }],
      },
    },
    {
      type: "assistant",
      timestamp: T("14:00:15"),
      message: { role: "assistant", content: [text("one file")] },
    },
  ]);

  // a second host that is a symlink to the first (mirrors are often mounted that way):
  // it is followed, and every file in it is a known one, so nothing is counted twice
  symlinkSync(join(mirror, "host-b"), join(mirror, "host-c"), "dir");

  // ── Codex rollouts ──
  const cx = (at, type, payload) => ({ timestamp: T(at), type, payload });
  const usage = (input, cached, output, reasoning) => ({
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: 0,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    total_tokens: input + output,
  });
  const started = (at) =>
    cx(at, "event_msg", {
      type: "task_started",
      turn_id: "t1",
      turn_attribution: { turn_trigger: "exec" },
    });
  // per-response records; the running token_count that follows each must not be counted again
  writeJsonl(
    join(codex, "2026", "01", "05", "rollout-2026-01-05T15-00-00-cdx1.jsonl"),
    [
      cx("15:00:00", "session_meta", {
        id: "cdx1",
        cli_version: "0.0.1",
        cwd: "/work/third",
        git: {
          branch: "main",
          repository_url: "https://git.example.test/example/demo-film.git",
        },
      }),
      started("15:00:00"),
      cx("15:00:01", "turn_context", {
        model: "codex-model-x",
        cwd: "/work/third",
      }),
      cx("15:00:01", "response_item", {
        type: "message",
        role: "user",
        content: [],
      }),
      cx("15:00:05", "response_item", {
        type: "custom_tool_call",
        name: "exec",
        input: `cat ${PROJECT}/edl.json`,
      }),
      cx("15:00:05", "token_usage_record", {
        response_id: "resp-1",
        usage: usage(1000, 600, 40, 5),
      }),
      cx("15:00:06", "response_item", {
        type: "custom_tool_call_output",
        output: [],
      }),
      cx("15:00:06", "event_msg", {
        type: "token_count",
        info: {
          last_token_usage: usage(1000, 600, 40, 5),
          total_token_usage: usage(1000, 600, 40, 5),
        },
      }),
      cx("15:00:10", "response_item", {
        type: "function_call",
        name: "shell",
        arguments: JSON.stringify({ cmd: "git status" }),
      }),
      cx("15:00:10", "token_usage_record", {
        response_id: "resp-2",
        usage: usage(1200, 1000, 20, 0),
      }),
      cx("15:00:11", "event_msg", {
        type: "token_count",
        info: {
          last_token_usage: usage(1200, 1000, 20, 0),
          total_token_usage: usage(2200, 1600, 60, 5),
        },
      }),
      cx("15:00:20", "response_item", {
        type: "message",
        role: "assistant",
        content: [],
      }),
      cx("15:00:20", "token_usage_record", {
        response_id: "resp-3",
        usage: usage(1300, 1200, 60, 10),
      }),
      cx("15:00:21", "event_msg", { type: "task_complete", turn_id: "t1" }),
    ],
  );
  // older shape: token_count only, with an empty one and a repeated one
  writeJsonl(
    join(codex, "2026", "01", "05", "rollout-2026-01-05T16-00-00-cdx2.jsonl"),
    [
      cx("16:00:00", "session_meta", { id: "cdx2", cwd: PROJECT }),
      started("16:00:00"),
      cx("16:00:01", "turn_context", { model: "codex-model-y", cwd: PROJECT }),
      cx("16:00:02", "response_item", {
        type: "custom_tool_call",
        name: "exec",
        input: "ls",
      }),
      cx("16:00:03", "event_msg", { type: "token_count", info: null }),
      cx("16:00:04", "event_msg", {
        type: "token_count",
        info: {
          last_token_usage: usage(500, 100, 10, 0),
          total_token_usage: usage(500, 100, 10, 0),
        },
      }),
      cx("16:00:05", "event_msg", {
        type: "token_count",
        info: {
          last_token_usage: usage(500, 100, 10, 0),
          total_token_usage: usage(500, 100, 10, 0),
        },
      }),
      cx("16:00:06", "event_msg", { type: "task_complete", turn_id: "t1" }),
    ],
  );

  // ── the project: rules, take records, operator events ──
  const rules = {
    "// what": "fixture rules; the schema is in docs/telemetry.md",
    name: "demo",
    window: { from: "2026-01-05T00:00:00Z", to: "2026-01-06T00:00:00Z" },
    idle_cap_minutes: 15,
    attribution: {
      path_prefixes: [PROJECT],
      repos: ["example/demo-film"],
      branches: ["demo-*"],
      ids: ["DOCID0001"],
    },
    class_order: ["tooling", "content", "overhead"],
    default_class: "overhead",
    classes: [
      {
        name: "plugin-repo",
        class: "tooling",
        path_prefixes: ["/work/plugin"],
      },
      { name: "project-files", class: "content", path_prefixes: [PROJECT] },
      { name: "project-docs", class: "content", ids: ["DOCID0001"] },
      { name: "git", class: "overhead", tools: ["Bash"], contains: ["git "] },
      { name: "memory", class: "overhead", tools: ["mcp__memory__*"] },
      { name: "in-project-dir", class: "content", cwd_prefixes: [PROJECT] },
    ],
    dropped: [`${PROJECT}/drafts/old.txt`],
  };
  mkdirSync(join(project, "telemetry"), { recursive: true });
  writeFileSync(
    join(project, "telemetry", "rules.json"),
    JSON.stringify(rules, null, 2) + "\n",
  );

  const take = (shot, n, extra) => {
    const dir = join(project, "takes", shot);
    mkdirSync(dir, { recursive: true });
    const rec = {
      shot_id: shot,
      take: n,
      model: "clip-x",
      cost_estimate_usd: 0.4,
      duration_s: 5,
      result_path: `takes/${shot}/t0${n}.mp4`,
      verdict: null,
      created_utc: T("09:10:00"),
      ...extra,
    };
    writeFileSync(
      join(dir, `take-t0${n}.json`),
      JSON.stringify(rec, null, 2) + "\n",
    );
  };
  take("S001", 1, { verdict: "redo" });
  take("S001", 2, { verdict: "usable" });
  take("S002", 1, {
    verdict: "usable",
    model: "clip-y",
    provider: "prov-a",
    cost_estimate_usd: 1,
  });
  take("S003", 1, { cost_estimate_usd: null });

  addEvent(project, {
    kind: "gate",
    gate: "G1",
    note: "song locked",
    at: T("09:00:00"),
  });
  addEvent(project, {
    kind: "waiting",
    note: "cut list sent",
    at: T("09:30:00"),
  });
  addEvent(project, {
    kind: "approval",
    note: "cut list ok",
    at: T("09:45:00"),
  });
  addEvent(project, {
    kind: "correction",
    note: "shot 3 too dark",
    at: T("10:10:00"),
  });
  addEvent(project, {
    kind: "gate",
    gate: "G2",
    note: "cut list approved",
    at: T("12:00:00"),
  });
  addEvent(project, { kind: "rejection", note: "still 4", at: T("12:30:00") });
  addEvent(project, {
    kind: "waiting",
    note: "animatic sent",
    at: T("13:00:00"),
  });
  addTime(project, {
    minutes: 30,
    what: "storyboard on paper",
    at: T("08:00:00"),
  });
  addTime(project, {
    minutes: 45,
    what: "listening session",
    at: T("08:30:00"),
  });

  return {
    project,
    sources: {
      claude: [claude],
      mirror: [mirror],
      codex: [codex],
      host: "host-a",
      home: "/home/nobody",
    },
  };
}

// Everything the later additions read, on top of buildFixture: an idea ledger (imported as a
// backfill file), quality taps, a review interval, more gates, classed declared time, a failed
// call and a dropped take, phases, an EDL and KPI targets. Element names are made up.
export function addExtras(fx) {
  const { project } = fx;
  const idea = (at, element, origin, proposer, labelled_by, extra = {}) => ({
    kind: "idea", element, origin, proposer, at: T(at), source: `storyboard doc, block "${element}"`, labelled_by, ...extra,
  });
  const backfill = [
    idea("09:01:00", "opening shot", "human", "human", "human"),
    idea("09:02:00", "color palette", "ai-chosen", "ai", "agent", { options_offered: 3 }),
    idea("09:03:00", "title card", "ai-chosen", "ai", "agent", { options_offered: 2 }),
    idea("09:04:00", "ending", "human-seeded-ai-developed", "human", "human", { surprise: true }),
    idea("09:05:00", "bridge motif", "ai-seeded-human-developed", "ai", "human", { options_offered: 4 }),
    idea("09:06:00", "clock prop", "real-system", "real-system", "agent"),
    idea("10:00:00", "title card", "dropped", "ai", "agent"),
    idea("10:30:00", "title card", "ai-chosen", "ai", "agent"),
    idea("10:40:00", "title card", "dropped", "ai", "agent", { dropped_origin: "ai-chosen" }),
    idea("10:50:00", "new ending", "human", "human", "human", { supersedes: "ending" }),
    idea("10:55:00", "rain idea", "dropped", "ai", "human", { dropped_origin: "ai-chosen" }),
    { kind: "correction", note: "bridge too slow", at: T("12:45:00"), source: "review notes, item 2" },
  ];
  const file = join(project, "backfill.jsonl");
  writeFileSync(file, backfill.map((r) => JSON.stringify(r) + "\n").join(""));
  const imported = importEvents(project, file);

  for (const [n, at] of [["G3", "12:10:00"], ["G4", "12:20:00"], ["G5", "12:30:00"], ["G6", "12:40:00"]]) {
    addEvent(project, { kind: "gate", gate: n, note: `gate ${n}`, at: T(at) });
  }
  addEvent(project, { kind: "quality", artifact: "cut-list-v1", score: 4, gate: "G1", at: T("11:05:00") });
  addEvent(project, { kind: "quality", artifact: "cut-list-v2", score: 2, gate: "G1", at: T("12:05:00") });
  addEvent(project, { kind: "quality", artifact: "animatic-v1", score: 5, gate: "G2", at: T("12:06:00") });
  addEvent(project, { kind: "quality", artifact: "still-3", score: 3, at: T("12:07:00") });
  addEvent(project, { kind: "review", artifact: "animatic-v1", start: T("10:10:00"), end: T("10:30:00") });
  addTime(project, { minutes: 10, what: "renaming files", category: "chores", at: T("08:45:00") });

  // a failed call and a dropped take, written the way the producer writes them
  const prompt = join(project, "prompt.txt");
  writeFileSync(prompt, "a prompt. No text, no captions.");
  const clip = join(project, "takes", "S005", "t01.mp4");
  mkdirSync(join(project, "takes", "S005"), { recursive: true });
  writeFileSync(clip, "not really a clip");
  const now = new Date(T("09:20:00"));
  const takes = join(project, "takes");
  writeTake(takes, {
    shot_id: "S004", model: "clip-y", resolution: "768p", duration_s: 5, prompt_file: prompt, cost_estimate_usd: 0.4,
    provider: "prov-a", request_id: "req-123", retries: 2, status: "failed", billed_usd: 0.1,
  }, { now });
  writeTake(takes, {
    shot_id: "S005", model: "clip-x", resolution: "768p", duration_s: 5, prompt_file: prompt, cost_estimate_usd: 0.2,
    result_path: clip, verdict: "dropped", reason: "continuity",
  }, { now });

  writeFileSync(join(project, "edl-final.json"), JSON.stringify([
    { clip: "takes/S001/t02.mp4", in: 0, out: 3 },
    { clip: "takes/S002/t01.mp4", in: 1, out: 2.5 },
    { shot_id: "S002", in_ms: 5000, out_ms: 6000 },
    { clip: "takes/S009/zz.mp4", in: 0, out: 1 },
  ]));

  const rulesFile = join(project, "telemetry", "rules.json");
  const rules = JSON.parse(readFileSync(rulesFile, "utf8"));
  Object.assign(rules, {
    edl: "edl-final.json",
    shot_elements: { S001: ["opening shot"], S002: ["opening shot", "color palette"] },
    phases: [
      { name: "drafts", artifacts: [`${PROJECT}/drafts`] },
      { name: "cut-list", gate: "G1", artifacts: [`${PROJECT}/edl.json`] },
      { name: "stills", gate: "G2", artifacts: [`${PROJECT}/refs`] },
    ],
    targets: { yield: 0.6, ai_to_human_ratio: 0.05 },
  });
  writeFileSync(rulesFile, JSON.stringify(rules, null, 2) + "\n");
  return { ...fx, imported, backfill: file, clip };
}

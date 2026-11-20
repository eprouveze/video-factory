#!/usr/bin/env node
// Per-project telemetry, computed from raw logs only. Nothing here is self-reported by an agent:
// tokens and models come from harness transcripts, paid spend and yield from take records, and
// human events from an append-only file the operator writes with `event add` / `time add`.
// Same inputs + same rules file = byte-identical facts.jsonl, summary.json and table: `run`
// never reads the clock, never uses randomness, and sorts everything it emits.
//
// usage:
//   node scripts/telemetry.mjs run --project <dir> [--rules <file>] [--out <dir>]
//        [--claude <root> ...] [--mirror <root> ...] [--codex <root> ...] [--takes <dir> ...]
//        [--from <ISO>] [--to <ISO>] [--host <name>] [--home <dir>] [--quiet]
//   node scripts/telemetry.mjs event add --project <dir> --kind correction|rejection|approval|gate|waiting
//        --note "..." [--at <ISO>] [--gate <label>]
//   node scripts/telemetry.mjs time add --project <dir> --minutes N --what "..." [--at <ISO>]
//   node scripts/telemetry.mjs compare <summary-A.json> <summary-B.json>
// Schema of the rules file and of every output: docs/telemetry.md
import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listShots, listTakes } from "./take-record.mjs";

export const EVENT_KINDS = [
  "correction",
  "rejection",
  "approval",
  "gate",
  "waiting",
];
export const TOKEN_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
  "thinking_tokens",
];
const DEFAULT_IDLE_CAP_MIN = 15;
// Older lines carry no origin field: a user line that starts like this was written by the
// harness or by another agent, not typed by a person. The first list starts new work.
const TRIGGER_PREFIXES = [
  "<task-notification",
  "<teammate-message",
  "<cross-session-message",
];
const HARNESS_PREFIXES = [
  "<local-command-stdout",
  "<system-reminder",
  "[Request interrupted",
];

const USAGE = `usage: node scripts/telemetry.mjs <run|event add|time add|compare> [options]
  run      --project DIR [--rules FILE] [--out DIR] [--claude ROOT ...] [--mirror ROOT ...]
           [--codex ROOT ...] [--takes DIR ...] [--from ISO] [--to ISO] [--host NAME] [--home DIR] [--quiet]
           reads <project>/telemetry/rules.json, writes facts.jsonl + summary.json next to it and
           prints the totals table. Source roots default to ~/.claude/projects, ~/.lex/transcripts
           and ~/.codex/sessions; pass "none" to switch one off.
  event add --project DIR --kind ${EVENT_KINDS.join("|")} --note TEXT [--at ISO] [--gate LABEL]
  time add  --project DIR --minutes N --what TEXT [--at ISO]
  compare  A/summary.json B/summary.json     print every number of A next to B with the difference
`;

// ── small deterministic helpers ─────────────────────────────────────────────────────────
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const secs = (ms) => Math.round(ms) / 1000;
const ratio = (a, b) => (b ? Math.round((a / b) * 1e4) / 1e4 : null);
const usd = (micro) => Math.round(micro / 100) / 1e4;
const iso = (ms) => new Date(ms).toISOString();
const zeroTokens = () => Object.fromEntries(TOKEN_FIELDS.map((f) => [f, 0]));
const addTokens = (into, from) => {
  for (const f of TOKEN_FIELDS) into[f] += from[f] || 0;
  return into;
};
const int = (v) =>
  Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0;

function* readLines(path) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    let rest = null;
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      const chunk = rest
        ? Buffer.concat([rest, buf.subarray(0, n)])
        : Buffer.from(buf.subarray(0, n));
      let start = 0;
      let nl;
      while ((nl = chunk.indexOf(10, start)) !== -1) {
        yield chunk.toString("utf8", start, nl);
        start = nl + 1;
      }
      rest = start < chunk.length ? chunk.subarray(start) : null;
    }
    if (rest?.length) yield rest.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readLines(path)) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line));
  }
  return out;
}

// A host directory of a mirror is often a symlink to a mounted bucket: follow it.
function isDir(e, parent) {
  if (e.isDirectory()) return true;
  if (!e.isSymbolicLink()) return false;
  try {
    return statSync(join(parent, e.name)).isDirectory();
  } catch {
    return false;
  }
}

function walkJsonl(dir, out = []) {
  if (!existsSync(dir)) return out;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    cmp(a.name, b.name),
  );
  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name !== "tool-results") walkJsonl(join(dir, e.name), out);
    } else if (e.isFile() && e.name.endsWith(".jsonl"))
      out.push(join(dir, e.name));
  }
  return out;
}

// ── rules ───────────────────────────────────────────────────────────────────────────────
// Keys that start with "//" are comments and are dropped, at any depth.
function stripComments(v) {
  if (Array.isArray(v)) return v.map(stripComments);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !k.startsWith("//"))
        .map(([k, x]) => [k, stripComments(x)]),
    );
  }
  return v;
}

const strList = (v, label) => {
  if (v == null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !x))
    throw new Error(`${label} must be a list of non-empty strings`);
  return v;
};

function parseTime(v, label) {
  if (v == null || v === "") return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) throw new Error(`${label} is not an ISO time: ${v}`);
  return ms;
}

export function loadRules(file, { home = homedir() } = {}) {
  const bytes = readFileSync(file);
  const raw = stripComments(JSON.parse(bytes.toString("utf8")));
  const paths = (list) =>
    list.flatMap((p) => {
      const clean = p.length > 1 ? p.replace(/\/+$/, "") : p;
      return clean.startsWith("~/")
        ? [clean, join(home, clean.slice(2))]
        : [clean];
    });
  const a = raw.attribution ?? {};
  const attribution = {
    path_prefixes: paths(strList(a.path_prefixes, "attribution.path_prefixes")),
    repos: strList(a.repos, "attribution.repos"),
    branches: strList(a.branches, "attribution.branches"),
    ids: strList(a.ids, "attribution.ids"),
  };
  if (!Object.values(attribution).some((l) => l.length))
    throw new Error("rules: attribution needs at least one matcher");
  const classOrder = strList(raw.class_order, "class_order");
  if (!classOrder.length) throw new Error("rules: class_order is required");
  if (!classOrder.includes(raw.default_class))
    throw new Error("rules: default_class must be one of class_order");
  if (!Array.isArray(raw.classes))
    throw new Error("rules: classes must be a list");
  const classes = raw.classes.map((c, i) => {
    if (!classOrder.includes(c.class))
      throw new Error(`rules: classes[${i}].class must be one of class_order`);
    const rule = {
      name: c.name ?? `${c.class}#${i + 1}`,
      class: c.class,
      tools: strList(c.tools, `classes[${i}].tools`),
      contains: strList(c.contains, `classes[${i}].contains`),
      path_prefixes: paths(
        strList(c.path_prefixes, `classes[${i}].path_prefixes`),
      ),
      ids: strList(c.ids, `classes[${i}].ids`),
      cwd_prefixes: paths(
        strList(c.cwd_prefixes, `classes[${i}].cwd_prefixes`),
      ),
    };
    if (
      !rule.tools.length &&
      !rule.contains.length &&
      !rule.path_prefixes.length &&
      !rule.ids.length &&
      !rule.cwd_prefixes.length
    ) {
      throw new Error(`rules: classes[${i}] has no matcher`);
    }
    return rule;
  });
  const cap = raw.idle_cap_minutes ?? DEFAULT_IDLE_CAP_MIN;
  if (!Number.isFinite(cap) || cap < 0)
    throw new Error("rules: idle_cap_minutes must be a number >= 0");
  return {
    name: raw.name ?? null,
    window: {
      from: parseTime(raw.window?.from, "window.from"),
      to: parseTime(raw.window?.to, "window.to"),
    },
    idle_cap_ms: Math.round(cap * 60000),
    attribution,
    class_order: classOrder,
    default_class: raw.default_class,
    classes,
    dropped: paths(strList(raw.dropped, "dropped")),
    takes_dirs: strList(raw.takes_dirs, "takes_dirs"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const underPath = (p, prefix) =>
  p === prefix || p.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
const globMatch = (pattern, value) =>
  pattern.endsWith("*")
    ? value.startsWith(pattern.slice(0, -1))
    : value === pattern;

// Why a turn belongs to the project: the first matcher that hits, in a fixed order.
function attributionOf(turn, rules) {
  const a = rules.attribution;
  for (const cwd of turn.cwds) {
    for (const p of a.path_prefixes) if (underPath(cwd, p)) return `cwd:${p}`;
    for (const r of a.repos)
      if (cwd.split("/").includes(r.split("/").pop())) return `repo:${r}`;
  }
  for (const r of a.repos) if (turn.repoText.includes(r)) return `repo:${r}`;
  for (const b of turn.branches)
    for (const pat of a.branches) if (globMatch(pat, b)) return `branch:${pat}`;
  for (const resp of turn.responses) {
    for (const tool of resp.tools) {
      for (const p of a.path_prefixes)
        if (tool.text.includes(p)) return `path:${p}`;
      for (const r of a.repos) if (tool.text.includes(r)) return `repo:${r}`;
      for (const id of a.ids) if (tool.text.includes(id)) return `id:${id}`;
    }
  }
  return null;
}

function classOfTool(tool, cwd, rules) {
  for (const rule of rules.classes) {
    if (rule.tools.length && !rule.tools.some((t) => globMatch(t, tool.name)))
      continue;
    const textual =
      rule.contains.length +
      rule.path_prefixes.length +
      rule.ids.length +
      rule.cwd_prefixes.length;
    if (!textual) return { class: rule.class, rule: rule.name };
    if (
      rule.contains.some((s) => tool.text.includes(s)) ||
      rule.path_prefixes.some((s) => tool.text.includes(s)) ||
      rule.ids.some((s) => tool.text.includes(s)) ||
      (cwd && rule.cwd_prefixes.some((s) => underPath(cwd, s)))
    )
      return { class: rule.class, rule: rule.name };
  }
  return { class: rules.default_class, rule: "default" };
}

// Class of each response in one turn. With tool calls: the majority class, ties broken by
// class_order. Without: the turn's most recent classified response, else its first, else the default.
function classifyTurn(turn, rules) {
  for (const resp of turn.responses) {
    if (!resp.tools.length) continue;
    const votes = new Map();
    for (const tool of resp.tools) {
      const c = classOfTool(tool, resp.cwd, rules);
      const v = votes.get(c.class) ?? { n: 0, rule: c.rule };
      v.n += 1;
      votes.set(c.class, v);
    }
    let best = null;
    for (const cls of rules.class_order) {
      const v = votes.get(cls);
      if (v && (!best || v.n > best.n))
        best = { class: cls, n: v.n, rule: v.rule };
    }
    resp.class = best.class;
    resp.class_rule = best.rule;
    resp.rework =
      rules.dropped.length > 0 &&
      resp.tools.every((t) => rules.dropped.some((d) => t.text.includes(d)));
  }
  const first = turn.responses.find((r) => r.tools.length);
  let recent = null;
  for (const resp of turn.responses) {
    if (resp.tools.length) {
      recent = resp;
      continue;
    }
    const src = recent ?? first;
    resp.class = src ? src.class : rules.default_class;
    resp.class_rule = recent
      ? "inherit-previous"
      : first
        ? "inherit-first"
        : "default";
    resp.rework = false;
  }
}

// ── parsers: every harness is reduced to the same event list ────────────────────────────
// event = { ts, kind: "human" | "trigger" | "response" | "other", cwd, branch, resp? }
const inWindow = (ts, win) =>
  (win.from == null || ts >= win.from) && (win.to == null || ts < win.to);

function userKind(o, text) {
  if (o.isCompactSummary) return "other";
  const origin =
    o.origin?.kind ??
    o.turnOrigin ??
    (o.promptSource === "system" ? "system" : null);
  if (origin && origin !== "human") return "trigger";
  if (o.isMeta) return "other";
  if (origin === "human") return "human";
  if (TRIGGER_PREFIXES.some((p) => text.startsWith(p))) return "trigger";
  return HARNESS_PREFIXES.some((p) => text.startsWith(p)) ? "other" : "human";
}

function parseClaude(file, { harness, host, win, subagent }) {
  const base = basename(file, ".jsonl");
  const s = {
    harness,
    host,
    file,
    session: base,
    subagent,
    agent: subagent ? base : null,
    link: null,
    events: [],
    repoText: "",
    mergedLines: 0,
  };
  const responses = new Map();
  let lineNo = 0;
  let sessionSeen = false;
  for (const line of readLines(file)) {
    lineNo += 1;
    if (!line.includes('"timestamp"')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = Date.parse(o.timestamp);
    if (Number.isNaN(ts) || !inWindow(ts, win)) continue;
    if (!sessionSeen && typeof o.sessionId === "string") {
      s.session = o.sessionId;
      sessionSeen = true;
    }
    const ev = {
      ts,
      kind: "other",
      cwd: typeof o.cwd === "string" ? o.cwd : null,
      branch: typeof o.gitBranch === "string" ? o.gitBranch : null,
      // Only model and tool traffic proves the loop was running; hook and bookkeeping
      // lines can be written hours later, when a session is reopened.
      active: o.type === "assistant" || o.type === "user",
    };
    const msg = o.message;
    if (o.type === "assistant" && msg && typeof msg === "object") {
      if (msg.model === "<synthetic>") continue;
      const hasId = msg.id != null || o.requestId != null;
      const key = hasId
        ? `${msg.id ?? ""}|${o.requestId ?? ""}`
        : `${harness}:${base}#${lineNo}`;
      let resp = responses.get(key);
      if (!resp) {
        resp = {
          key,
          global: hasId,
          ts,
          model:
            typeof msg.model === "string" && msg.model ? msg.model : "unknown",
          usage: zeroTokens(),
          usageReported: false,
          tools: [],
          toolIds: new Set(),
          cwd: ev.cwd,
          sidechain: subagent || o.isSidechain === true,
        };
        responses.set(key, resp);
        ev.kind = "response";
        ev.resp = resp;
      } else s.mergedLines += 1;
      const u = msg.usage;
      if (u && typeof u === "object") {
        resp.usageReported = true;
        const seen = {
          input_tokens: int(u.input_tokens),
          output_tokens: int(u.output_tokens),
          cache_read_input_tokens: int(u.cache_read_input_tokens),
          cache_creation_input_tokens: int(u.cache_creation_input_tokens),
          thinking_tokens: int(u.output_tokens_details?.thinking_tokens),
        };
        // One response is written once per content block; a later line can carry a larger count.
        for (const f of TOKEN_FIELDS)
          resp.usage[f] = Math.max(resp.usage[f], seen[f]);
      }
      for (const block of Array.isArray(msg.content) ? msg.content : []) {
        if (block?.type !== "tool_use") continue;
        if (block.id != null) {
          if (resp.toolIds.has(block.id)) continue;
          resp.toolIds.add(block.id);
        }
        resp.tools.push({
          name: String(block.name ?? ""),
          text: `${block.name ?? ""} ${JSON.stringify(block.input ?? null)}`,
        });
      }
    } else if (
      o.type === "user" &&
      msg &&
      typeof msg === "object" &&
      !subagent &&
      o.isSidechain !== true
    ) {
      const c = msg.content;
      const blocks = Array.isArray(c) ? c : [];
      const typed =
        typeof c === "string" || blocks.some((b) => b?.type !== "tool_result");
      if (typed) {
        const text =
          typeof c === "string"
            ? c
            : String(blocks.find((b) => b?.type === "text")?.text ?? "");
        ev.kind = userKind(o, text.trimStart());
      }
    }
    s.events.push(ev);
  }
  if (subagent) {
    const meta = join(dirname(file), `${base}.meta.json`);
    if (existsSync(meta)) {
      try {
        s.link = JSON.parse(readFileSync(meta, "utf8")).toolUseId ?? null;
      } catch {
        s.link = null;
      }
    }
  }
  return s;
}

// Codex rollout: one `token_usage_record` per model response (older files only have
// `event_msg/token_count`, which repeats, so a count whose running total did not move is skipped).
// A response owns the tool calls written since the previous one. input_tokens includes the cached part.
function parseCodex(file, { host, win }) {
  const s = {
    harness: "codex",
    host,
    file,
    session: basename(file, ".jsonl"),
    subagent: false,
    agent: null,
    link: null,
    events: [],
    repoText: "",
    mergedLines: 0,
  };
  const rows = [];
  for (const line of readLines(file)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* a torn last line is not data */
    }
  }
  const hasRecords = rows.some((o) => o.type === "token_usage_record");
  let model = "unknown";
  let cwd = null;
  let branch = null;
  let pending = [];
  let lastTotal = null;
  let n = 0;
  for (const o of rows) {
    const p = o.payload && typeof o.payload === "object" ? o.payload : {};
    if (o.type === "session_meta") {
      s.session = p.id ?? p.session_id ?? s.session;
      cwd = p.cwd ?? cwd;
      branch = p.git?.branch ?? branch;
      s.repoText = String(p.git?.repository_url ?? "");
    } else if (o.type === "turn_context") {
      model = p.model ?? model;
      cwd = p.cwd ?? cwd;
    }
    const ts = Date.parse(o.timestamp);
    if (Number.isNaN(ts) || !inWindow(ts, win)) continue;
    const ev = { ts, kind: "other", cwd, branch, active: true };
    if (
      o.type === "response_item" &&
      ["function_call", "custom_tool_call", "local_shell_call"].includes(p.type)
    ) {
      const body = p.arguments ?? p.input ?? p.action ?? null;
      pending.push({
        name: String(p.name ?? p.type),
        text: `${p.name ?? p.type} ${typeof body === "string" ? body : JSON.stringify(body)}`,
      });
    } else if (o.type === "event_msg" && p.type === "task_started") {
      const trigger = p.turn_attribution?.turn_trigger ?? null;
      ev.kind = trigger === "exec" ? "trigger" : "human";
      ev.turnStart = true;
    }
    let u = null;
    if (hasRecords && o.type === "token_usage_record") u = p.usage ?? null;
    else if (
      !hasRecords &&
      o.type === "event_msg" &&
      p.type === "token_count" &&
      p.info
    ) {
      const total = JSON.stringify(p.info.total_token_usage ?? null);
      if (total !== lastTotal) u = p.info.last_token_usage ?? null;
      lastTotal = total;
    }
    if (u) {
      n += 1;
      const cached = int(u.cached_input_tokens);
      ev.kind = "response";
      ev.resp = {
        key: `codex|${s.session}|${p.response_id ?? n}`,
        global: true,
        ts,
        model,
        usageReported: true,
        usage: {
          input_tokens: Math.max(0, int(u.input_tokens) - cached),
          output_tokens: int(u.output_tokens),
          cache_read_input_tokens: cached,
          cache_creation_input_tokens: int(u.cache_write_input_tokens),
          thinking_tokens: int(u.reasoning_output_tokens),
        },
        tools: pending,
        toolIds: new Set(),
        cwd,
        sidechain: false,
      };
      pending = [];
    }
    s.events.push(ev);
  }
  return s;
}

// A turn starts at a human message and runs to the next one. Inside it, a harness trigger
// (background-task notice, scheduler, peer message) opens a new segment: AI time is the sum of
// the segments, and the silence before a trigger is reported as idle, not as work.
function buildTurns(s) {
  const turns = [];
  let cur = null;
  const open = (ev, human) => {
    cur = {
      session: s.session,
      start: ev.ts,
      end: ev.ts,
      human,
      segments: [{ start: ev.ts, end: ev.ts }],
      cwds: [],
      branches: [],
      responses: [],
      repoText: s.repoText,
      attr: null,
      toolCalls: 0,
    };
    turns.push(cur);
  };
  for (const ev of s.events) {
    const preamble = cur && cur.implicit && !cur.responses.length;
    if (ev.turnStart && preamble) {
      // session header lines before the first declared turn belong to that turn
      cur.implicit = false;
      cur.human = ev.kind === "human";
    } else if (ev.kind === "human" || (ev.turnStart && cur))
      open(ev, ev.kind === "human");
    else if (!cur) {
      if (!ev.active) continue;
      open(ev, false);
      cur.implicit = true;
    } else if (ev.kind === "trigger")
      cur.segments.push({ start: ev.ts, end: ev.ts });
    const seg = cur.segments[cur.segments.length - 1];
    if (ev.active && ev.ts > seg.end) seg.end = ev.ts;
    if (ev.active && ev.ts > cur.end) cur.end = ev.ts;
    if (ev.cwd && !cur.cwds.includes(ev.cwd)) cur.cwds.push(ev.cwd);
    if (ev.branch && !cur.branches.includes(ev.branch))
      cur.branches.push(ev.branch);
    if (ev.resp) {
      cur.responses.push(ev.resp);
      cur.toolCalls += ev.resp.tools.length;
    }
  }
  const used = new Map();
  for (const t of turns) {
    const id = `${s.session}@${iso(t.start)}`;
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    t.id = n ? `${id}#${n + 1}` : id;
  }
  return turns;
}

// ── collection ──────────────────────────────────────────────────────────────────────────
function collectSessions(sources, rules, win) {
  const sessions = [];
  const owner = new Map(); // file identity -> index of the root that supplied it first
  let root = 0;
  const fresh = (f) => win.from == null || statSync(f).mtimeMs >= win.from;
  const take = (identity) => {
    if (owner.has(identity) && owner.get(identity) !== root) return false;
    owner.set(identity, root);
    return true;
  };
  const claudeTree = (dir, host, harness) => {
    for (const f of walkJsonl(dir)) {
      const subagent = f.split("/").includes("subagents");
      const identity = `${harness}:${subagent ? basename(dirname(dirname(f))) + "/" : ""}${basename(f)}`;
      if (!fresh(f) || !take(identity)) continue;
      sessions.push(parseClaude(f, { harness, host, win, subagent }));
    }
  };
  for (const dir of sources.claude) {
    claudeTree(dir, sources.host, "claude-code");
    root += 1;
  }
  for (const dir of sources.mirror) {
    if (!existsSync(dir)) continue;
    for (const h of readdirSync(dir, { withFileTypes: true })
      .filter((e) => isDir(e, dir))
      .map((e) => e.name)
      .sort(cmp)) {
      claudeTree(join(dir, h, "claude"), h, "claude-code");
      claudeTree(join(dir, h, "agy-converted"), h, "agy");
      root += 1;
    }
  }
  for (const dir of sources.codex) {
    for (const f of walkJsonl(dir)) {
      if (!fresh(f) || !take(`codex:${basename(f)}`)) continue;
      sessions.push(parseCodex(f, { host: sources.host, win }));
    }
    root += 1;
  }
  return sessions.filter((s) => s.events.length);
}

function readTakes(dirs, win) {
  const takes = [];
  for (const dir of dirs) {
    for (const shot of listShots(dir)) {
      for (const t of listTakes(dir, shot)) {
        const at = t.created_utc ? Date.parse(t.created_utc) : NaN;
        if (!Number.isNaN(at) && !inWindow(at, win)) continue;
        takes.push(t);
      }
    }
  }
  return takes;
}

export function analyze({
  rules,
  sources,
  win,
  events = [],
  declared = [],
  takes = [],
}) {
  const sessions = collectSessions(sources, rules, win);
  const mains = sessions.filter((s) => !s.subagent);
  const subs = sessions.filter((s) => s.subagent);
  const spawnedBy = new Map(); // tool_use id -> turn that made the call
  for (const s of sessions) {
    s.turns = buildTurns(s);
    if (s.subagent && s.turns.length > 1) {
      // A subagent transcript is one unit of work, whatever it contains.
      const [first, ...more] = s.turns;
      for (const t of more) {
        first.segments.push(...t.segments);
        first.responses.push(...t.responses);
        first.toolCalls += t.toolCalls;
        for (const c of t.cwds) if (!first.cwds.includes(c)) first.cwds.push(c);
        for (const b of t.branches)
          if (!first.branches.includes(b)) first.branches.push(b);
        if (t.end > first.end) first.end = t.end;
      }
      s.turns = [first];
    }
    for (const t of s.turns)
      for (const r of t.responses)
        for (const id of r.toolIds)
          if (!spawnedBy.has(id)) spawnedBy.set(id, t);
  }
  for (const s of mains) {
    let prev = null;
    for (const t of s.turns) {
      t.attr =
        attributionOf(t, rules) ??
        (t.toolCalls === 0 && prev ? "inherit" : null);
      prev = t.attr;
    }
  }
  const resolveSub = (s) => {
    const t = s.turns[0];
    if (t.resolved) return;
    t.resolved = true;
    const parent = s.link ? spawnedBy.get(s.link) : null;
    if (parent && parent !== t) {
      const owner = subs.find((x) => x.turns[0] === parent);
      if (owner) resolveSub(owner);
      // The spawning turn decides; a subagent that touches the project on its own
      // (its parent turn was about something else) is still project work.
      t.attr = parent.attr ? "parent" : attributionOf(t, rules);
      t.parent = parent.parent ?? parent.id;
    } else {
      t.attr = attributionOf(t, rules);
      t.parent = null;
    }
  };
  for (const s of subs) resolveSub(s);

  // tokens: one row per response, deduplicated across every source by (message id, request id)
  const seen = new Set();
  const facts = [];
  let duplicates = 0;
  let mergedLines = 0;
  for (const s of sessions) {
    mergedLines += s.mergedLines;
    for (const t of s.turns) {
      classifyTurn(t, rules);
      for (const r of t.responses) {
        if (r.global) {
          if (seen.has(r.key)) {
            duplicates += 1;
            continue;
          }
          seen.add(r.key);
        }
        if (!t.attr) continue;
        facts.push({
          ts: iso(r.ts),
          host: s.host,
          harness: s.harness,
          session: s.session,
          sidechain: r.sidechain,
          agent: s.agent,
          model: r.model,
          ...r.usage,
          usage_reported: r.usageReported,
          tool_calls: r.tools.length,
          class: r.class,
          class_rule: r.class_rule,
          turn: s.subagent ? (t.parent ?? t.id) : t.id,
          attribution_rule: t.attr,
          rework: r.rework,
          response: r.key,
        });
      }
    }
  }
  facts.sort(
    (a, b) =>
      cmp(a.ts, b.ts) ||
      cmp(a.host, b.host) ||
      cmp(a.harness, b.harness) ||
      cmp(a.session, b.session) ||
      cmp(a.response, b.response),
  );

  // time
  const time = {
    ai_ms: 0,
    ai_idle_ms: 0,
    subagent_ms: 0,
    human_active_ms: 0,
    away_ms: 0,
    turns: 0,
    human_turns: 0,
    subagents: 0,
  };
  const countedTurns = new Set();
  const usedSessions = new Set();
  for (const s of mains) {
    s.turns.forEach((t, i) => {
      if (!t.attr || countedTurns.has(t.id)) return;
      countedTurns.add(t.id);
      usedSessions.add(`${s.harness}:${s.session}`);
      time.turns += 1;
      if (t.human) time.human_turns += 1;
      t.segments.forEach((seg, k) => {
        time.ai_ms += seg.end - seg.start;
        if (k > 0)
          time.ai_idle_ms += Math.max(0, seg.start - t.segments[k - 1].end);
      });
      const next = s.turns[i + 1];
      if (next?.human) {
        const gap = Math.max(0, next.start - t.end);
        time.human_active_ms += Math.min(gap, rules.idle_cap_ms);
        time.away_ms += Math.max(0, gap - rules.idle_cap_ms);
      }
    });
  }
  for (const s of subs) {
    const t = s.turns[0];
    if (!t.attr) continue;
    time.subagents += 1;
    time.subagent_ms += t.end - t.start;
  }

  // token roll-ups
  const group = (keyOf, fieldsOf) => {
    const m = new Map();
    for (const f of facts) {
      const k = keyOf(f);
      if (!m.has(k))
        m.set(k, { ...fieldsOf(f), responses: 0, ...zeroTokens() });
      const row = m.get(k);
      row.responses += 1;
      addTokens(row, f);
    }
    return [...m.entries()].sort((a, b) => cmp(a[0], b[0])).map(([, v]) => v);
  };
  const total = { responses: facts.length, ...zeroTokens() };
  for (const f of facts) addTokens(total, f);
  const byClass = rules.class_order.map((c) => {
    const row = { class: c, responses: 0, ...zeroTokens() };
    for (const f of facts) if (f.class === c) addTokens(row, f).responses += 1;
    return row;
  });
  const rework = { responses: 0, ...zeroTokens() };
  for (const f of facts) if (f.rework) addTokens(rework, f).responses += 1;
  const prompt =
    total.input_tokens +
    total.cache_read_input_tokens +
    total.cache_creation_input_tokens;

  // paid spend and yield: take records only
  const spendRows = new Map();
  const shots = new Map();
  let spendMicro = 0;
  let unpriced = 0;
  for (const t of takes) {
    const provider =
      typeof t.provider === "string" && t.provider ? t.provider : null;
    const k = `${provider ?? ""}\u0000${t.model}`;
    if (!spendRows.has(k))
      spendRows.set(k, {
        provider,
        model: t.model,
        takes: 0,
        takes_without_cost: 0,
        micro: 0,
      });
    const row = spendRows.get(k);
    row.takes += 1;
    if (
      typeof t.cost_estimate_usd === "number" &&
      Number.isFinite(t.cost_estimate_usd)
    ) {
      const micro = Math.round(t.cost_estimate_usd * 1e6);
      row.micro += micro;
      spendMicro += micro;
    } else {
      row.takes_without_cost += 1;
      unpriced += 1;
    }
    if (!shots.has(t.shot_id))
      shots.set(t.shot_id, { shot: t.shot_id, takes: 0, kept: 0 });
    const shot = shots.get(t.shot_id);
    shot.takes += 1;
    if (t.verdict === "usable") shot.kept += 1;
  }
  const perShot = [...shots.values()].sort((a, b) => cmp(a.shot, b.shot));
  const kept = perShot.reduce((n, s) => n + s.kept, 0);

  // human events
  const evs = events
    .filter((e) => inWindow(Date.parse(e.at), win))
    .sort(
      (a, b) =>
        cmp(a.at, b.at) ||
        cmp(a.kind, b.kind) ||
        cmp(a.note ?? "", b.note ?? ""),
    );
  const byKind = Object.fromEntries(
    EVENT_KINDS.map((k) => [k, evs.filter((e) => e.kind === k).length]),
  );
  const gates = evs
    .filter((e) => e.kind === "gate")
    .map((e, i, all) => ({
      gate: e.gate ?? e.note ?? "",
      at: e.at,
      since_previous_s: i
        ? secs(Date.parse(e.at) - Date.parse(all[i - 1].at))
        : null,
    }));
  const waiting = { resolved: 0, open: 0, total_s: 0, intervals: [] };
  let waitingSince = null;
  let waitingMs = 0;
  for (const e of evs) {
    if (e.kind === "waiting" && waitingSince == null) waitingSince = e.at;
    else if (
      (e.kind === "approval" || e.kind === "rejection") &&
      waitingSince != null
    ) {
      const ms = Date.parse(e.at) - Date.parse(waitingSince);
      waitingMs += ms;
      waiting.resolved += 1;
      waiting.intervals.push({
        from: waitingSince,
        to: e.at,
        ended_by: e.kind,
        seconds: secs(ms),
      });
      waitingSince = null;
    }
  }
  if (waitingSince != null) waiting.open = 1;
  waiting.total_s = secs(waitingMs);
  const decl = declared.filter(
    (d) => d.at == null || inWindow(Date.parse(d.at), win),
  );

  const summary = {
    schema: 1,
    project: rules.name,
    rules_sha256: rules.sha256,
    window: {
      from: win.from == null ? null : iso(win.from),
      to: win.to == null ? null : iso(win.to),
    },
    idle_cap_minutes: rules.idle_cap_ms / 60000,
    sources: {
      sessions: usedSessions.size,
      subagent_transcripts: time.subagents,
      responses: facts.length,
      duplicate_lines_merged: mergedLines,
      duplicate_responses_dropped: duplicates,
    },
    tokens: {
      total,
      by_model_harness: group(
        (f) => `${f.model}\u0000${f.harness}`,
        (f) => ({ model: f.model, harness: f.harness }),
      ),
      by_class: byClass,
      cache_hit_ratio: ratio(total.cache_read_input_tokens, prompt),
      rework,
    },
    time: {
      turns: time.turns,
      human_turns: time.human_turns,
      ai_s: secs(time.ai_ms),
      ai_idle_s: secs(time.ai_idle_ms),
      subagent_parallel_s: secs(time.subagent_ms),
      human_active_s: secs(time.human_active_ms),
      away_s: secs(time.away_ms),
      declared_minutes: decl.reduce((n, d) => n + d.minutes, 0),
      declared: decl.map((d) => ({
        at: d.at ?? null,
        minutes: d.minutes,
        what: d.what,
      })),
    },
    spend: {
      total_usd: usd(spendMicro),
      takes_without_cost: unpriced,
      by_provider_model: [...spendRows.entries()]
        .sort((a, b) => cmp(a[0], b[0]))
        .map(([, r]) => ({
          provider: r.provider,
          model: r.model,
          takes: r.takes,
          takes_without_cost: r.takes_without_cost,
          usd: usd(r.micro),
        })),
    },
    yield: {
      takes: takes.length,
      kept,
      ratio: ratio(kept, takes.length),
      by_shot: perShot.map((s) => ({ ...s, ratio: ratio(s.kept, s.takes) })),
    },
    events: { by_kind: byKind, gates, waiting },
  };
  return { facts, summary };
}

// ── rendering ───────────────────────────────────────────────────────────────────────────
function hms(s) {
  const t = Math.round(s);
  const pad = (n) => String(n).padStart(2, "0");
  return `${Math.floor(t / 3600)}h${pad(Math.floor((t % 3600) / 60))}m${pad(t % 60)}s`;
}

function table(head, rows) {
  const all = [head, ...rows].map((r) =>
    r.map((c) => (c == null ? "-" : String(c))),
  );
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const numeric = head.map(
    (_, i) =>
      rows.length > 0 &&
      rows.every((r) => typeof r[i] === "number" || r[i] == null),
  );
  return all
    .map((r) =>
      r
        .map((c, i) => (numeric[i] ? c.padStart(w[i]) : c.padEnd(w[i])))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export function renderSummary(s) {
  const tok = (r) => [
    r.responses,
    r.input_tokens,
    r.output_tokens,
    r.cache_read_input_tokens,
    r.cache_creation_input_tokens,
    r.thinking_tokens,
  ];
  const head = [
    "responses",
    "input",
    "output",
    "cache_read",
    "cache_write",
    "thinking",
  ];
  const t = s.time;
  const out = [
    `telemetry: ${s.project ?? "(unnamed)"}   window ${s.window.from ?? "open"} .. ${s.window.to ?? "open"}`,
    `sources: ${s.sources.sessions} sessions, ${s.sources.subagent_transcripts} subagent transcripts, ${s.sources.responses} responses` +
      ` (${s.sources.duplicate_lines_merged} duplicate lines merged, ${s.sources.duplicate_responses_dropped} duplicate responses dropped)`,
    "",
    "TOKENS by model x harness",
    table(
      ["model", "harness", ...head],
      [
        ...s.tokens.by_model_harness.map((r) => [
          r.model,
          r.harness,
          ...tok(r),
        ]),
        ["TOTAL", "", ...tok(s.tokens.total)],
      ],
    ),
    "",
    "TOKENS by class",
    table(
      ["class", ...head],
      [
        ...s.tokens.by_class.map((r) => [r.class, ...tok(r)]),
        ["rework (subset)", ...tok(s.tokens.rework)],
      ],
    ),
    `cache-hit ratio: ${s.tokens.cache_hit_ratio ?? "-"}`,
    "",
    "TIME",
    table(
      ["measure", "value", "seconds"],
      [
        ["AI (turns)", hms(t.ai_s), t.ai_s],
        ["AI idle inside turns", hms(t.ai_idle_s), t.ai_idle_s],
        [
          "subagents (parallel)",
          hms(t.subagent_parallel_s),
          t.subagent_parallel_s,
        ],
        [
          `human active (cap ${s.idle_cap_minutes} min)`,
          hms(t.human_active_s),
          t.human_active_s,
        ],
        ["away", hms(t.away_s), t.away_s],
        [
          "declared (not measured)",
          hms(t.declared_minutes * 60),
          t.declared_minutes * 60,
        ],
      ],
    ),
    `turns: ${t.turns} (${t.human_turns} started by a person)`,
    "",
    "PAID SPEND (take records only)",
    table(
      ["provider", "model", "takes", "no cost", "usd"],
      [
        ...s.spend.by_provider_model.map((r) => [
          r.provider,
          r.model,
          r.takes,
          r.takes_without_cost,
          r.usd.toFixed(4),
        ]),
        [
          "TOTAL",
          "",
          s.yield.takes,
          s.spend.takes_without_cost,
          s.spend.total_usd.toFixed(4),
        ],
      ],
    ),
    "",
    "YIELD (takes kept = verdict usable)",
    table(
      ["shot", "takes", "kept", "ratio"],
      [
        ...s.yield.by_shot.map((r) => [r.shot, r.takes, r.kept, r.ratio]),
        ["ALL", s.yield.takes, s.yield.kept, s.yield.ratio],
      ],
    ),
    "",
    "HUMAN EVENTS",
    table(
      ["kind", "count"],
      EVENT_KINDS.map((k) => [k, s.events.by_kind[k]]),
    ),
    ...s.events.gates.map(
      (g) =>
        `gate ${g.gate} at ${g.at}: ${g.since_previous_s == null ? "first gate" : `${hms(g.since_previous_s)} after the previous gate`}`,
    ),
    `waiting on a person: ${hms(s.events.waiting.total_s)} over ${s.events.waiting.resolved} resolved, ${s.events.waiting.open} still open`,
  ];
  return out.join("\n") + "\n";
}

// Every number in a summary, as "path -> value"; rows of a breakdown are named by their string fields.
function flatten(v, path, out) {
  if (typeof v === "number") out.set(path, v);
  else if (Array.isArray(v)) {
    v.forEach((item, i) => {
      const label =
        item && typeof item === "object"
          ? Object.values(item)
              .filter((x) => typeof x === "string")
              .join("/") || String(i)
          : String(i);
      flatten(item, `${path}[${label}]`, out);
    });
  } else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v))
      flatten(x, path ? `${path}.${k}` : k, out);
  return out;
}

export function compareSummaries(a, b) {
  const skip = (p) =>
    p === "schema" ||
    p.startsWith("time.declared[") ||
    p.startsWith("events.waiting.intervals");
  const fa = flatten(a, "", new Map());
  const fb = flatten(b, "", new Map());
  const paths = [...new Set([...fa.keys(), ...fb.keys()])]
    .filter((p) => !skip(p))
    .sort(cmp);
  const num = (n) =>
    n == null ? null : Number.isInteger(n) ? n : Number(n.toFixed(4));
  const rows = paths.map((p) => {
    const x = fa.get(p) ?? null;
    const y = fb.get(p) ?? null;
    return [
      p,
      num(x),
      num(y),
      x != null && y != null ? num(y - x) : null,
      x != null && y != null ? ratio(y, x) : null,
    ];
  });
  return (
    `A: ${a.project ?? "(unnamed)"}   B: ${b.project ?? "(unnamed)"}\n` +
    table(["metric", "A", "B", "B-A", "B/A"], rows) +
    "\n"
  );
}

// ── operator records ────────────────────────────────────────────────────────────────────
const telemetryDir = (project) => join(resolve(project), "telemetry");

function stamp(at, now) {
  if (at == null) return now.toISOString();
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) throw new Error(`--at is not an ISO time: ${at}`);
  return new Date(ms).toISOString();
}

export function addEvent(
  project,
  { kind, note, at, gate },
  { now = new Date() } = {},
) {
  if (!EVENT_KINDS.includes(kind))
    throw new Error(`--kind must be one of ${EVENT_KINDS.join(", ")}`);
  if (!note) throw new Error("--note is required");
  const rec = {
    at: stamp(at, now),
    kind,
    note: String(note),
    ...(gate ? { gate: String(gate) } : {}),
  };
  mkdirSync(telemetryDir(project), { recursive: true });
  appendFileSync(
    join(telemetryDir(project), "events.jsonl"),
    JSON.stringify(rec) + "\n",
  );
  return rec;
}

export function addTime(
  project,
  { minutes, what, at },
  { now = new Date() } = {},
) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0)
    throw new Error("--minutes must be a positive number");
  if (!what) throw new Error("--what is required");
  const rec = {
    at: stamp(at, now),
    minutes: m,
    what: String(what),
    declared: true,
  };
  mkdirSync(telemetryDir(project), { recursive: true });
  appendFileSync(
    join(telemetryDir(project), "declared-time.jsonl"),
    JSON.stringify(rec) + "\n",
  );
  return rec;
}

export function run(opts) {
  const project = resolve(opts.project);
  const home = opts.home ?? homedir();
  const rules = loadRules(
    opts.rules ?? join(telemetryDir(project), "rules.json"),
    { home },
  );
  const win = {
    from:
      opts.from != null ? parseTime(opts.from, "--from") : rules.window.from,
    to: opts.to != null ? parseTime(opts.to, "--to") : rules.window.to,
  };
  const roots = (given, fallback) =>
    (given?.length ? given : [fallback])
      .filter((d) => d !== "none")
      .map((d) => resolve(d));
  const sources = {
    host: opts.host ?? hostname().split(".")[0],
    claude: roots(opts.claude, join(home, ".claude", "projects")),
    mirror: roots(opts.mirror, join(home, ".lex", "transcripts")),
    codex: roots(opts.codex, join(home, ".codex", "sessions")),
  };
  const takesDirs = opts.takes?.length
    ? opts.takes.map((d) => resolve(d))
    : (rules.takes_dirs.length ? rules.takes_dirs : ["takes"]).map((d) =>
        resolve(project, d),
      );
  const tdir = telemetryDir(project);
  const { facts, summary } = analyze({
    rules,
    sources,
    win,
    events: readJsonl(join(tdir, "events.jsonl")),
    declared: readJsonl(join(tdir, "declared-time.jsonl")),
    takes: readTakes(takesDirs, win),
  });
  if (summary.project == null) summary.project = basename(project);
  const out = resolve(opts.out ?? tdir);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "facts.jsonl"),
    facts.map((f) => JSON.stringify(f) + "\n").join(""),
  );
  writeFileSync(
    join(out, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  return { facts, summary, out, text: renderSummary(summary) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { _: [] };
  const many = new Set(["claude", "mirror", "codex", "takes"]);
  const flags = new Set(["quiet"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      opts._.push(a);
      continue;
    }
    const k = a.slice(2);
    if (flags.has(k)) {
      opts[k] = true;
      continue;
    }
    const v = argv[++i];
    if (v == null) throw new Error(`${a} needs a value`);
    if (many.has(k)) (opts[k] ??= []).push(v);
    else opts[k] = v;
  }
  return opts;
}

function main(argv) {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return argv.length ? 0 : 2;
  }
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}`);
    return 2;
  }
  const [cmd, sub] = o._;
  try {
    if (cmd === "compare") {
      if (o._.length !== 3)
        throw new Error("compare needs two summary.json paths");
      const load = (p) => JSON.parse(readFileSync(resolve(p), "utf8"));
      process.stdout.write(compareSummaries(load(o._[1]), load(o._[2])));
      return 0;
    }
    if (
      !["run", "event", "time"].includes(cmd) ||
      (cmd !== "run" && sub !== "add")
    ) {
      process.stderr.write(`unknown command: ${o._.join(" ")}\n${USAGE}`);
      return 2;
    }
    if (!o.project) throw new Error("--project is required");
    if (cmd === "run") {
      const r = run(o);
      if (!o.quiet) process.stdout.write(r.text);
    } else if (cmd === "event")
      process.stdout.write(JSON.stringify(addEvent(o.project, o)) + "\n");
    else process.stdout.write(JSON.stringify(addTime(o.project, o)) + "\n");
    return 0;
  } catch (e) {
    process.stderr.write(`telemetry: ${e.message}\n`);
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(main(process.argv.slice(2)));
}

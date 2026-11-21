# Project telemetry

`scripts/telemetry.mjs` measures what a project cost: tokens by model and harness, where the
tokens went (tooling, content, overhead), AI time, human time, paid spend, take yield,
corrections and waiting time. Every number is computed from raw logs and records. No agent
reports anything about itself.

It is deterministic: the same logs and the same rules file give byte-identical output. `run`
never reads the clock and uses no randomness; everything it writes is sorted. A test runs it
twice and compares the bytes.

```
node scripts/telemetry.mjs run --project projects/demo
node scripts/telemetry.mjs event add --project projects/demo --kind approval --note "cut list ok"
node scripts/telemetry.mjs time add --project projects/demo --minutes 30 --what "storyboard on paper"
node scripts/telemetry.mjs compare projects/demo/telemetry/summary.json projects/other/telemetry/summary.json
```

## Files, all inside `<project>/telemetry/`

| File | Written by | What |
|---|---|---|
| `rules.json` | you | what belongs to the project and how tool calls are classed |
| `events.jsonl` | `event add` | corrections, rejections, approvals, gates, waiting |
| `declared-time.jsonl` | `time add` | offline time a person declares |
| `facts.jsonl` | `run` | one row per model response attributed to the project |
| `summary.json` | `run` | the totals; the same numbers are printed as a table |

## Inputs (read-only)

| Source | Default | Flag | Harness |
|---|---|---|---|
| Claude Code transcripts, with `<session>/subagents/agent-*.jsonl` | `~/.claude/projects` | `--claude` | `claude-code` |
| Fleet mirror, `<root>/<host>/claude/` and `<root>/<host>/agy-converted/` | `~/.lex/transcripts` | `--mirror` | `claude-code`, `agy` |
| Codex rollouts, `YYYY/MM/DD/*.jsonl` | `~/.codex/sessions` | `--codex` | `codex` |
| Take records (`scripts/take-record.mjs`) | `<project>/takes` | `--takes` | |

Each flag can be repeated; `none` switches a source off. With a `window.from`, a file not
modified since then is skipped without being read; without one every file is read, which on a
mirror kept on a network mount takes a long time (pass `--mirror none` when the project ran on
one machine). `--host` names the machine
that owns the local roots (default: its hostname), `--home` says what `~/` means in the rules.
`--from` / `--to` override the window of the rules file. `--rules` and `--out` point at
another rules file and output directory, which is how a baseline is made (see below).

What is read from each log:

- **Claude Code.** An assistant line carries `message.model` (the served id, recorded as is),
  `message.usage` and `requestId`. One API response is written as several lines, one per
  content block, all with the same usage, so responses are merged by (`message.id`,
  `requestId`); per token field the largest value seen wins. The same key removes a response
  that appears again in another file (a resumed or forked session, a mirror copy). A file whose
  name was already read from an earlier source root is skipped. Lines with model `<synthetic>`
  are not responses.
- **agy-converted.** Claude-shaped lines with no ids, no model and no usage. Responses and time
  are counted; the model is `unknown`, tokens are 0 and `usage_reported` is `false`.
- **Codex.** One `token_usage_record` per response. Files without them only have
  `event_msg` / `token_count`, which repeats: a count whose running total did not move is
  skipped. `input_tokens` includes the cached part, so it is split:
  `input = input_tokens - cached_input_tokens`, `cache_read = cached_input_tokens`. A response
  owns the tool calls written since the previous response. The model comes from `turn_context`.

## The rules file

A commented example: `examples/telemetry-rules.example.json`. Keys that start with `//` are
comments.

| Key | Meaning |
|---|---|
| `name` | label used in the summary (default: the project directory name) |
| `window.from`, `window.to` | ISO times; only log events in `[from, to)` are read. Either can be left out |
| `idle_cap_minutes` | cap on one human gap (default 15) |
| `attribution.path_prefixes` | a turn matches when its cwd is under one, or a tool call mentions one |
| `attribution.repos` | matches a cwd path segment, a tool call, or a Codex repository URL |
| `attribution.branches` | git branch of the turn; a trailing `*` is a prefix |
| `attribution.ids` | any id a tool call can mention: a document id, a folder id |
| `class_order` | the classes, in the order that breaks a tie |
| `default_class` | class of a tool call no rule matches |
| `classes[]` | ordered rules, first match wins: `name`, `class`, and matchers |
| `dropped` | paths or ids of artifacts that were thrown away |
| `takes_dirs` | take-record directories relative to the project (default `takes`) |

A class rule matches a tool call when its tool name passes `tools` (if given; a trailing `*`
is a prefix) and, if any of `contains`, `path_prefixes`, `ids`, `cwd_prefixes` is given, at
least one hits. The text matchers look at the tool name followed by its JSON input, so a Bash
command, a file path and a document id are all visible to them. A path that starts with `~/`
is matched both literally and with the home directory. The three classes this plugin uses:
**tooling** (the plugin repo, scripts, CI), **content** (the project directory, its documents,
generation calls, renders), **overhead** (git, board, memory lookups).

## How a response is attributed and classed

- **Turn.** A message typed by a person (not a tool result, a harness notice or a message
  from another agent) and everything after it up to the next one, in the same session. A
  session no person typed in is a single turn with no human side.
- **Project.** A turn belongs to the project when its cwd or git branch matches, or any tool
  call in it does. A turn with no tool calls takes the answer of the previous turn of the
  session. A subagent transcript takes the answer of the turn that spawned it (linked through
  `agent-*.meta.json` → `toolUseId`); when that turn is not project work, or the link is
  missing, its own tool calls decide.
- **Class.** A response takes the class of its tool calls: the majority if they differ, ties
  broken by `class_order`. A response with no tool calls takes the class of the turn's most
  recent classed response, else of its first one, else `default_class`.
- **Rework.** A response whose tool calls touched only `dropped` artifacts.

## Time

- **AI time.** Per turn, from the human message to the last model or tool line. A harness
  trigger inside a turn (a background-job notice, a scheduled wake-up, a message from another
  agent) starts a new segment: AI time is the sum of the segments and the silence before the
  trigger is reported as **AI idle**. Hook and bookkeeping lines do not count as activity.
- **Subagent time.** First to last line of each attributed subagent transcript, summed and
  reported on its own line. It ran in parallel, so it is never added to AI time.
- **Human active.** The gap from the end of a turn to the next human message of the session,
  up to `idle_cap_minutes`. The rest of the gap is **away**.
- **Declared.** `time add` appends to `declared-time.jsonl`. It is shown on its own line,
  labelled declared, and is never added to measured time.

Limits: a tool that waits on a person (a permission prompt) counts as AI time, and a Codex
`exec` turn has no human side.

## Human events

`event add --kind correction|rejection|approval|gate|waiting --note "..." [--at ISO] [--gate LABEL]`
appends to `events.jsonl`. `--at` defaults to the moment the command runs; `run` itself only
reads what the file holds. The summary gives the count per kind, the lead time per gate (time
since the previous `gate` event) and the waiting time: from a `waiting` event to the next
`approval` or `rejection`. A `waiting` with no answer yet is counted as open, not timed.

## Money and yield

Subscription harnesses are reported in tokens only. Paid spend is the sum of
`cost_estimate_usd` of the take records, grouped by `provider` (when the record has one) and
`model`; a take without a cost is counted, not priced. Yield is takes with verdict `usable`
over takes generated, per shot and overall. No price is ever derived from tokens.

## `facts.jsonl`

`ts`, `host`, `harness`, `session`, `sidechain`, `agent`, `model`, `input_tokens`,
`output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `thinking_tokens`
(part of `output_tokens`), `usage_reported`, `tool_calls`, `class`, `class_rule`, `turn`,
`attribution_rule`, `rework`, `response`. Sorted by time, host, harness, session, response.

## Baseline and comparison

Run the same logs with another rules file or window and keep the result apart:

```
node scripts/telemetry.mjs run --project projects/demo --rules baseline-rules.json --out projects/demo/telemetry/baseline
node scripts/telemetry.mjs compare projects/demo/telemetry/baseline/summary.json projects/demo/telemetry/summary.json
```

`compare` prints every number of A next to B, with `B-A` and `B/A`.

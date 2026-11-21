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
node scripts/telemetry.mjs event add --project projects/demo --kind quality --artifact animatic-v1 --score 4 --gate G4
node scripts/telemetry.mjs event import --project projects/demo --file backfill.jsonl
node scripts/telemetry.mjs qc --project projects/demo
node scripts/telemetry.mjs edl --project projects/demo
python3 scripts/yt_analytics.py --video-id <id> --project projects/demo
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
| `render-qc.json` | `qc` | loudness, black and freeze frames, duration of the final video |
| `outcome.json` | `scripts/yt_analytics.py` | YouTube figures over fixed windows after publication |

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
| `final_video` | path of the final render, relative to the project: cost per finished minute, QC |
| `edl` | path of the final cut list, relative to the project: EDL survival |
| `shot_elements` | `{shot: [idea elements]}`, to join EDL survival to the idea ledger |
| `phases[]` | ordered `name`, `gate`, `artifacts`: backward cascade |
| `edit_tools` | tool names that count as an edit (default Edit, Write, MultiEdit, NotebookEdit, apply_patch) |
| `qc` | thresholds for render QC |
| `targets` | optional `{kpi: number}`; unset by default |

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
- **Human at the keyboard.** The gap from the end of a turn to the next human message of the
  session, up to `idle_cap_minutes`. The rest of the gap is **away**.
- **Human reviewing.** `review` events give intervals (`--start`, `--end`, `--artifact`). A gap
  that overlaps a review is not capped: the reviewed part is review time, the rest is keyboard
  time, none of it is away.
- **Declared.** `time add` appends to `declared-time.jsonl`. It is a person's word, not a
  measurement, and is always shown on its own line.
- **Human total** = keyboard + review + declared, with the three parts next to it.
- **Split: decide / correct / chores.** A keyboard gap is classed by the events recorded between
  its start and the end of the turn it leads to: a `correction` makes it *correct*; an
  `approval`, `rejection`, `gate`, `quality` or `idea` makes it *decide*. Review time is
  *decide*. Declared time is classed only when it was declared with `--category`. Everything
  else is reported as not derivable; it is never guessed.

Limits: a tool that waits on a person (a permission prompt) counts as AI time, and a Codex
`exec` turn has no human side.

## Human events

`event add --kind <kind> [--at ISO] [--source TEXT]` appends one validated line to
`events.jsonl`. `--at` defaults to the moment the command runs; `run` itself only reads what the
file holds. `event import --file x.jsonl` takes the same fields, one JSON object per line
(`at` required), validates every line before writing anything, and skips a line the ledger
already holds, so a backfill can be run again.

| Kind | Fields | What the summary does with it |
|---|---|---|
| `correction`, `rejection`, `approval` | `note`, optional `gate` | count per kind |
| `gate` | `note`, `gate` (label) | lead time per gate = time since the previous gate |
| `waiting` | `note` | waiting time, up to the next `approval` or `rejection`; unanswered = open, not timed |
| `idea` | `element`, `origin`, `proposer`, `labelled_by`, `source`; optional `options_offered`, `surprise`, `supersedes`, `dropped_origin` | the idea ledger |
| `review` | `artifact`, `start`, `end` | review time |
| `quality` | `artifact`, `score` 1-5, optional `gate` | quality per gate; `labelled_by` is always `human` |

### Idea ledger

One `idea` event says where an element of the work came from. `origin` is one of `human`,
`ai-chosen`, `human-seeded-ai-developed`, `ai-seeded-human-developed`, `real-system`,
`dropped`. `proposer` is `human`, `ai` or `real-system`. `labelled_by` (`human` or `agent`) says
who wrote the label, and every figure below is also given per labeller. `source` says where the
element is recorded (a document id and a block heading, for example).

- The latest event of an element wins. A `dropped` element keeps what it was as
  `dropped_origin` (given, or taken from its previous event). `--supersedes X` drops X.
- **Share by origin**: elements not dropped, each count over the number of live elements.
- **AI acceptance rate** = live elements with origin `ai-chosen`, `human-seeded-ai-developed`
  or `ai-seeded-human-developed`, over those plus the dropped elements whose proposer is `ai`.
- **Mean options offered**: over the idea events that carry `options_offered`.
- **Surprise**: `--surprise` is a flag only the person sets; the count is labelled declared.
- **Re-proposals**: an idea event for an element whose latest state is `dropped`.

### Quality tap

At a gate the agent asks the person for one tap: `event add --kind quality --artifact <id>
--score 1-5 --gate <label>`. The summary gives the distribution per gate, and every effort KPI
row carries the mean quality and its n. Skip rule: a `gate` event with no quality event for the
same gate label counts as skipped; when skipped / gates is over 0.30 after at least 5 gates the
summary prints `QUALITY TAP: skipped >30%, retire per rule`.

## Money, yield and the take record

Subscription harnesses are reported in tokens only. Paid spend is the sum over the take
records, grouped by `provider` and `model`: the `billed_usd` the provider returned when the
record has it, else `cost_estimate_usd`; a take with neither is counted, not priced. No price
is ever derived from tokens. Yield is takes with verdict `usable` over all takes, per shot and
overall.

`scripts/take-record.mjs` records, per paid call: the prompt and result hashes
(`prompt_sha256`, `result_sha256`), the plugin commit (`plugin_sha`), and the provenance
envelope `--provider`, `--request-id`, `--retries`, `--status ok|failed|safety_block`,
`--billed`. A failed or blocked call gets a record too (verdict `failed`): it counts in spend
and in the yield denominator. A verdict of `redo` or `dropped` needs
`--reason taste|continuity|technical|cost`, and the summary breaks the thrown-away takes down by
reason.

## Effort KPIs

Rule: a ratio is never shown without its numerator and its denominator. Each row also carries
the mean quality and its n.

| KPI | Numerator | Denominator |
|---|---|---|
| `ai_to_human_ratio` | AI seconds | human total seconds |
| `ai_to_human_ratio_with_subagents` | AI + subagent seconds | human total seconds |
| `tokens_per_human_minute` | input + output + cache read + cache write | human total minutes |
| `output_tokens_per_human_minute` | output tokens | human total minutes |
| `tooling_share_of_tokens` | tokens of class `tooling` | all tokens |
| `tooling_share_of_ai_time` | AI seconds of class `tooling` (a turn's AI time is split evenly over its responses) | AI seconds |
| `cost_per_finished_minute` | paid spend | minutes of `final_video`, probed with ffprobe |
| `yield` | takes kept | takes |
| `rework_share_of_tokens` | rework tokens | all tokens |

`targets` in the rules file is optional and empty by default: `{"yield": 0.6}`. A row shows
`target` and `vs_target` only for a KPI that has one.

## Final render: QC, EDL survival, backward cascade

- `telemetry.mjs qc --project P` runs ffmpeg on `final_video` and writes
  `telemetry/render-qc.json`: duration, integrated loudness (ebur128, LUFS), black frames
  (blackdetect) and freeze frames (freezedetect) with the thresholds of `qc` in the rules file
  (defaults `black_min_s` 0.1, `black_pix_th` 0.05, `freeze_noise_db` -60, `freeze_min_s`
  0.22), the file hash and the ffmpeg version, since the figures are deterministic for one
  build of ffmpeg. `run` copies the file into the summary.
- `telemetry.mjs edl --project P [--edl FILE]` reads the final cut (`edl` in the rules file):
  rows `{clip, in, out}` in seconds, matched to a take by its `result_path`, or cut-list rows
  `{shot_id, in_ms, out_ms}`, which stand for the shot's last usable take. It reports seconds
  generated against seconds kept, per shot and per take, and per idea element when
  `shot_elements` maps shots to elements. `run` adds it to the summary.
- **Backward cascade.** `phases` in the rules file lists the phases in order, each with its
  `gate` label and `artifacts` (paths or ids). The summary counts edit-tool calls
  (`edit_tools`, default Edit, Write, MultiEdit, NotebookEdit, apply_patch) on an earlier
  phase's artifacts made after the gate of any later phase.

## Outcome check

`python3 scripts/yt_analytics.py --video-id ID --project P` writes `telemetry/outcome.json`
from read-only YouTube Analytics: views, averageViewDuration, averageViewPercentage, likes,
comments, subscribersGained. The two windows are fixed by the video's `publishedAt`: publish
day + 7 days and + 28 days. A window that is not over (its last day plus 3 days of reporting
lag) is written as `incomplete` with no numbers, so the file never holds partial figures and a
complete window does not change on a later run. The refresh token needs the scope
`yt-analytics.readonly`; `yt_auth.py` asks for it, and a token made before that has to be
granted again by a person. `run` copies the file into the summary, so `compare` covers it.

## Version stamps

Every facts row carries `harness_version` (the `version` field of a Claude Code line, the
`cli_version` of a Codex session, null when the log has none) and `plugin_sha`, the commit of
the plugin checkout that ran the analysis (`--plugin-sha` overrides it). Take records carry the
`plugin_sha` of the checkout that made the call.

## `facts.jsonl`

`ts`, `host`, `harness`, `session`, `sidechain`, `agent`, `model`, `input_tokens`,
`output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `thinking_tokens`
(part of `output_tokens`), `usage_reported`, `tool_calls`, `class`, `class_rule`, `turn`,
`attribution_rule`, `rework`, `harness_version`, `plugin_sha`, `response`. Sorted by time, host, harness, session, response.

## Baseline and comparison

Run the same logs with another rules file or window and keep the result apart:

```
node scripts/telemetry.mjs run --project projects/demo --rules baseline-rules.json --out projects/demo/telemetry/baseline
node scripts/telemetry.mjs compare projects/demo/telemetry/baseline/summary.json projects/demo/telemetry/summary.json
```

`compare` prints every number of A next to B, with `B-A` and `B/A`: tokens, time, spend, yield,
every KPI with its numerator and denominator, the creativity and quality figures, render QC
and the outcome windows.

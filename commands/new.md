---
description: Scaffold a new video project from a template (manifest skeleton + Remotion project + working folders).
argument-hint: "<template> [project-name]   templates: explainer | reel | product-demo | talking-head | faceless-story | event-recap"
allowed-tools: Bash, Read, Write
---

# /video-factory:new

Scaffold a project directory the rest of the pipeline operates on.

## Steps
1. Resolve the template from `$ARGUMENTS` (default `explainer`). Valid: `explainer`, `reel`,
   `product-demo`, `talking-head`, `faceless-story`, `event-recap`. If unknown, list the options and stop.
   - `event-recap` recaps a REAL talk/session/launch — its manifest `$comment` carries the method
     (ground in the real transcript/deck/recording, verbatim gold quotes, real-voice apex lines via
     `scripts/extract-voice.mjs`, team-credit framing). See quality-rules §9.
2. Create `projects/<project-name>/` (default name = template + date). Inside:
   - `manifest.json` — copied from `templates/<template>/manifest.json` (a preset: format,
     hook type, brand block, scene scaffolding, default `provider_assignments`).
   - `project.json` — `{ "template": "<t>", "status": "draft", "scenes": {} }` (the
     reconciliation ledger: planned-vs-produced state per scene).
   - empty `assets/ audio/ clips/ output/`.
3. Tell the user the project path and the next step:
   - Fill in the brief, then `/video-factory:video` to author + produce, **or** hand-edit
     `manifest.json` and run `/video-factory:render` for the zero-key path.
4. Do NOT generate any assets here — `:new` only scaffolds. Generation is `:video`.

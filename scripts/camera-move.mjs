#!/usr/bin/env node
// CLI for inspecting the 46 camera movements and building structured 5-slot clip prompts.
//
// Usage:
//   node scripts/camera-move.mjs list [--category <cat>] [--json]
//   node scripts/camera-move.mjs get <id-or-slug> [--json]
//   node scripts/camera-move.mjs build --move <id-or-slug> --brief "<scene>" [--ref-context "<text>"] [--style "<suffix>"] [--no-text-guard]

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listMoves,
  getMove,
  buildClipPrompt,
} from "./lib/camera-moves.mjs";

function usage() {
  process.stderr.write(
    [
      "Usage:",
      "  node scripts/camera-move.mjs list [--category <category>] [--json]",
      "  node scripts/camera-move.mjs get <id-or-slug> [--json]",
      "  node scripts/camera-move.mjs build --move <id-or-slug> --brief \"<scene>\" [--ref-context \"<text>\"] [--style \"<suffix>\"] [--no-text-guard]",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const flags = new Set();
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json" || a === "--no-text-guard" || a === "--ref-frame" || a === "--help" || a === "-h") {
      flags.add(a);
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val !== undefined && !val.startsWith("--")) {
        opts[key] = val;
        i++;
      } else {
        flags.add(a);
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, opts, positional };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { flags, opts, positional } = parseArgs(process.argv.slice(2));
  const cmd = positional[0] || "list";

  if (flags.has("--help") || flags.has("-h")) {
    usage();
    process.exit(0);
  }

  if (cmd === "list") {
    const moves = listMoves({ category: opts.category });
    if (flags.has("--json")) {
      process.stdout.write(JSON.stringify(moves, null, 2) + "\n");
    } else {
      for (const m of moves) {
        process.stdout.write(
          `${m.id.padEnd(4)} | ${m.category.padEnd(15)} | ${m.slug.padEnd(24)} | ${m.name} — ${m.intent}\n`,
        );
      }
      process.stdout.write(`\nTotal: ${moves.length} camera movements\n`);
    }
    process.exit(0);
  }

  if (cmd === "get") {
    const target = positional[1] || opts.move || opts.id;
    if (!target) {
      usage();
      process.exit(2);
    }
    const move = getMove(target);
    if (!move) {
      process.stderr.write(`Unknown camera movement: "${target}"\n`);
      process.exit(1);
    }
    if (flags.has("--json")) {
      process.stdout.write(JSON.stringify(move, null, 2) + "\n");
    } else {
      process.stdout.write(
        [
          `ID:              ${move.id}`,
          `Slug:            ${move.slug}`,
          `Name:            ${move.name}`,
          `Category:        ${move.category}`,
          `Remotion Motion: ${move.remotion_motion}`,
          `Intent:          ${move.intent}`,
          `When to Use:     ${move.when_to_use}`,
          `Prompt:          ${move.prompt}`,
          "",
        ].join("\n"),
      );
    }
    process.exit(0);
  }

  if (cmd === "build") {
    const moveArg = opts.move || positional[1];
    if (!moveArg) {
      process.stderr.write("build requires --move <id-or-slug>\n");
      usage();
      process.exit(2);
    }
    try {
      const out = buildClipPrompt({
        move: moveArg,
        brief: opts.brief || "",
        refFrame: flags.has("--ref-frame") ? "ref.png" : opts["ref-frame"] || null,
        refContext: opts["ref-context"] || "",
        styleSuffix: opts.style || "",
        noTextGuard: flags.has("--no-text-guard"),
      });
      process.stdout.write(out + "\n");
      process.exit(0);
    } catch (e) {
      process.stderr.write(String(e.message || e) + "\n");
      process.exit(1);
    }
  }

  usage();
  process.exit(2);
}

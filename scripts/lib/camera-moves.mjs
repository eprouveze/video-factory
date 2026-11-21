// Camera movements catalog & 5-slot prompt builder.
// Loads the 46 camera movements from skills/camera-movements/moves.json and formats
// structured clip generation prompts (separating camera movement from scene action,
// first-frame reference lock, look suffix, and no-text guard).

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MOVES_PATH = join(ROOT, "skills/camera-movements/moves.json");

let cachedCatalog = null;

export function loadCatalog() {
  if (!cachedCatalog) {
    cachedCatalog = JSON.parse(readFileSync(MOVES_PATH, "utf8"));
  }
  return cachedCatalog;
}

export function loadMoves() {
  return loadCatalog().moves;
}

export function listMoves({ category } = {}) {
  const moves = loadMoves();
  if (!category) return moves;
  const target = String(category).trim().toLowerCase();
  return moves.filter((m) => m.category.toLowerCase() === target);
}

const normalizeKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/^shot\s+/i, "")
    .replace(/[_\s/]+/g, "-");

export function getMove(idOrSlug) {
  if (!idOrSlug) return null;
  const raw = String(idOrSlug).trim();
  const upper = raw.toUpperCase().replace(/^SHOT\s+/i, "");
  const norm = normalizeKey(raw);
  const moves = loadMoves();
  return (
    moves.find((m) => m.id.toUpperCase() === upper) ||
    moves.find((m) => m.slug.toLowerCase() === norm) ||
    moves.find((m) => normalizeKey(m.name) === norm) ||
    moves.find((m) => (m.aliases || []).some((a) => normalizeKey(a) === norm)) ||
    null
  );
}

export function formatCameraBlock(idOrSlug) {
  const move = typeof idOrSlug === "object" && idOrSlug?.prompt ? idOrSlug : getMove(idOrSlug);
  if (!move) {
    throw new Error(
      `Unknown camera movement "${idOrSlug}". Run \`node scripts/camera-move.mjs list\` to see all 46 movements.`,
    );
  }
  return move.prompt;
}

export const DEFAULT_REF_LOCK_NOTE =
  "Use the provided start frame as the locked opening composition. Preserve subject identity, framing, lighting, depth, lens feel, and screen direction from the reference image while applying only the specified camera movement.";

export const NO_TEXT_GUARD = "No text, no captions, no interface, no logos.";

export function buildClipPrompt({
  move,
  brief = "",
  refFrame = null,
  refContext = "",
  styleSuffix = "",
  noTextGuard = false,
} = {}) {
  const cleanBrief = String(brief || "").trim();
  const cleanStyle = String(styleSuffix || "").trim();
  const cleanRefContext = String(refContext || "").trim();

  if (!move) {
    const combined = [cleanBrief, cleanStyle].filter(Boolean).join(" ");
    if (noTextGuard && !/no text,\s*no captions/i.test(combined)) {
      return [combined, NO_TEXT_GUARD].filter(Boolean).join(" ").trim();
    }
    return combined;
  }

  const resolved = typeof move === "object" && move?.prompt ? move : getMove(move);
  if (!resolved) {
    throw new Error(
      `Unknown camera movement "${move}". Run \`node scripts/camera-move.mjs list\` to see all 46 movements.`,
    );
  }

  const sections = [
    `Camera movement:\n${resolved.prompt}`,
  ];

  if (refFrame || cleanRefContext) {
    const refLines = [
      cleanRefContext ? cleanRefContext : null,
      DEFAULT_REF_LOCK_NOTE,
    ]
      .filter(Boolean)
      .join(" ");
    sections.push(`Reference image context:\n${refLines}`);
  }

  if (cleanBrief) {
    sections.push(`Scene action:\n${cleanBrief}`);
  }

  if (cleanStyle) {
    sections.push(`Mood and style:\n${cleanStyle}`);
  }

  if (noTextGuard && !/no text,\s*no captions/i.test(cleanBrief)) {
    sections.push(NO_TEXT_GUARD);
  }

  return sections.join("\n\n");
}

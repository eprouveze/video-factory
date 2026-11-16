#!/usr/bin/env node
// Subtitles (.srt and .vtt) from word timings: each line of the lines file takes the next
// words of the timing list, so line starts and ends are the MEASURED word times, never guesses.
//
// usage: node scripts/srt-from-words.mjs <words.json> <lines.(txt|json)> --out <base> [--max-chars 42] [--min-hold-ms 0]
//   words.json  [{word,start_ms,end_ms}, ...]  or  {words:[...]}
//   lines file  one subtitle line per row (blank rows ignored), or a JSON array of strings
//   writes <base>.srt and <base>.vtt
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `usage: node scripts/srt-from-words.mjs <words.json> <lines.txt|lines.json> --out <base> [--max-chars 42]
  Groups the word timings by the lines file (a line consumes as many words as it has
  whitespace-separated tokens) and writes <base>.srt and <base>.vtt. Fails when the lines and
  the words do not match token for token, and warns on lines longer than --max-chars.
`;

const norm = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function formatTime(ms, sep) {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(t % 1000, 3)}`;
}
export const formatSrtTime = (ms) => formatTime(ms, ",");
export const formatVttTime = (ms) => formatTime(ms, ".");

export function buildCues(words, lines, { minHoldMs = 0 } = {}) {
  if (!Array.isArray(words) || !words.length) throw new Error("no word timings");
  const cues = [];
  let i = 0;
  lines.forEach((line, n) => {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return;
    const chunk = words.slice(i, i + tokens.length);
    if (chunk.length < tokens.length) throw new Error(`line ${n + 1} ("${line}") runs past the end of the word timings`);
    tokens.forEach((tok, k) => {
      if (norm(tok) && norm(chunk[k].word) !== norm(tok)) {
        throw new Error(`line ${n + 1}: token "${tok}" does not match timed word "${chunk[k].word}" (word ${i + k + 1})`);
      }
    });
    const start = chunk[0].start_ms;
    let end = chunk[chunk.length - 1].end_ms;
    if (!(end > start)) throw new Error(`line ${n + 1}: non-positive duration`);
    if (end - start < minHoldMs) end = start + minHoldMs;
    cues.push({ index: cues.length + 1, start_ms: start, end_ms: end, text: line.trim() });
    i += tokens.length;
  });
  if (i < words.length) throw new Error(`${words.length - i} timed words are not covered by the lines file`);
  for (let k = 1; k < cues.length; k++) {
    if (cues[k].start_ms < cues[k - 1].end_ms) cues[k - 1].end_ms = cues[k].start_ms;
  }
  return cues;
}

export const toSrt = (cues) =>
  cues.map((c) => `${c.index}\n${formatSrtTime(c.start_ms)} --> ${formatSrtTime(c.end_ms)}\n${c.text}\n`).join("\n");
export const toVtt = (cues) =>
  "WEBVTT\n\n" + cues.map((c) => `${formatVttTime(c.start_ms)} --> ${formatVttTime(c.end_ms)}\n${c.text}\n`).join("\n");

export function readLines(path) {
  const raw = readFileSync(path, "utf8");
  if (path.endsWith(".json")) {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.some((x) => typeof x !== "string")) throw new Error("lines JSON must be an array of strings");
    return arr;
  }
  return raw.split(/\r?\n/).filter((l) => l.trim());
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const pos = [];
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      if (argv[i + 1] == null) {
        process.stderr.write(`${argv[i]} needs a value\n${USAGE}`);
        return 2;
      }
      o[argv[i].slice(2)] = argv[++i];
    } else pos.push(argv[i]);
  }
  if (pos.length !== 2 || !o.out) {
    process.stderr.write(USAGE);
    return 2;
  }
  try {
    const raw = JSON.parse(readFileSync(resolve(pos[0]), "utf8"));
    const words = Array.isArray(raw) ? raw : raw.words;
    const lines = readLines(resolve(pos[1]));
    const maxChars = Number(o["max-chars"] ?? 42);
    const cues = buildCues(words, lines, { minHoldMs: Number(o["min-hold-ms"] ?? 0) });
    for (const c of cues) if (c.text.length > maxChars) process.stderr.write(`warning: cue ${c.index} is ${c.text.length} characters (max ${maxChars})\n`);
    const base = resolve(o.out);
    writeFileSync(`${base}.srt`, toSrt(cues));
    writeFileSync(`${base}.vtt`, toVtt(cues));
    process.stdout.write(`wrote ${base}.srt and ${base}.vtt (${cues.length} cues)\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`srt-from-words: ${e.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

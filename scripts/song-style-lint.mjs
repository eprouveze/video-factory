#!/usr/bin/env node
// Check a song generator's style string before a paid run.
// A style box has a character limit and the generator cuts what does not fit, so a term that
// decides the result (the voice type, for example) must sit in the first words.
//
//   node scripts/song-style-lint.mjs <style.txt>... [--max 1000] [--must-lead "term"]... [--lead-window 120]
//
// Exits 1 if a file is longer than --max, or if a --must-lead term is missing or starts
// after the first --lead-window characters.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function lintStyle(text, { max = 1000, mustLead = [], leadWindow = 120 } = {}) {
  const style = text.trim();
  const problems = [];
  if (style.length > max) problems.push(`${style.length} characters, limit ${max}: the last ${style.length - max} would be cut`);
  const lower = style.toLowerCase();
  for (const term of mustLead) {
    const at = lower.indexOf(term.toLowerCase());
    if (at === -1) problems.push(`"${term}" is missing`);
    else if (at + term.length > leadWindow) problems.push(`"${term}" starts at character ${at}, after the first ${leadWindow}`);
  }
  return { length: style.length, problems };
}

function main(argv) {
  const files = [];
  const opts = { max: 1000, mustLead: [], leadWindow: 120 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max") opts.max = Number(argv[++i]);
    else if (a === "--must-lead") opts.mustLead.push(argv[++i]);
    else if (a === "--lead-window") opts.leadWindow = Number(argv[++i]);
    else files.push(a);
  }
  if (!files.length || !Number.isFinite(opts.max) || !Number.isFinite(opts.leadWindow)) {
    console.error('usage: song-style-lint.mjs <style.txt>... [--max 1000] [--must-lead "term"]... [--lead-window 120]');
    return 2;
  }
  let failed = false;
  for (const file of files) {
    const { length, problems } = lintStyle(readFileSync(file, "utf8"), opts);
    if (problems.length) {
      failed = true;
      for (const p of problems) console.log(`FAIL  ${file}: ${p}`);
    } else console.log(`ok    ${file}: ${length}/${opts.max} characters`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));

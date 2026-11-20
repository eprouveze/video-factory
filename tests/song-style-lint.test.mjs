import { test } from "node:test";
import assert from "node:assert/strict";
import { lintStyle } from "../scripts/song-style-lint.mjs";

test("a short style with the voice first passes", () => {
  const r = lintStyle("gritty female contralto lead vocal, garage rock, four-piece band", { mustLead: ["contralto"] });
  assert.deepEqual(r.problems, []);
});

test("a style over the limit is refused and says how much would be cut", () => {
  const r = lintStyle("x".repeat(1010), { max: 1000 });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /last 10 would be cut/);
});

test("a deciding term that is missing or too late is refused", () => {
  const late = "garage rock, ".repeat(12) + "contralto lead vocal";
  assert.match(lintStyle(late, { mustLead: ["contralto"] }).problems[0], /after the first 120/);
  assert.match(lintStyle("garage rock", { mustLead: ["contralto"] }).problems[0], /is missing/);
});

test("the term match ignores case", () => {
  assert.deepEqual(lintStyle("Raspy Baritone lead", { mustLead: ["baritone"] }).problems, []);
});

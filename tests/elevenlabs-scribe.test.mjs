// Offline: maps a Scribe response (shape from the ElevenLabs STT docs) to the stt contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapScribe } from "../providers/stt/elevenlabs-scribe.mjs";

const resp = {
  language_code: "eng",
  language_probability: 0.98,
  text: "Hello world!",
  audio_duration_secs: 1.2,
  words: [
    { text: "Hello", type: "word", start: 0, end: 0.5, logprob: -0.1 },
    { text: " ", type: "spacing", start: 0.5, end: 0.55, logprob: 0 },
    { text: " world!", type: "word", start: 0.55, end: 1.1, logprob: -0.2 },
    { text: "(laughter)", type: "audio_event", start: 1.1, end: 1.2 },
    { text: "ghost", type: "word", start: null, end: null },
  ],
};

test("scribe mapping: whisper-shaped output, seconds, real words only", () => {
  const out = mapScribe(resp);
  assert.deepEqual(out.words, [
    { word: "Hello", start: 0, end: 0.5 },
    { word: "world!", start: 0.55, end: 1.1 },
  ]);
  assert.equal(out.text, "Hello world!");
  assert.equal(out.duration, 1.2);
});

test("scribe mapping: duration falls back to last word end; empty is safe", () => {
  const { audio_duration_secs, ...rest } = resp;
  assert.equal(mapScribe(rest).duration, 1.1);
  assert.deepEqual(mapScribe({ text: "" }), {
    text: "",
    words: [],
    duration: 0,
  });
});

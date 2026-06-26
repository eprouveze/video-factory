#!/usr/bin/env node
// stt adapter — OpenAI Whisper (whisper-1) with WORD-LEVEL timestamps.
// Contract: providers/CONTRACTS.md (stt).
// stdin  {audio_path, out_path?, language?}
// stdout {text, words:[{word,start,end}], segments:[{text,start,end}], duration}
//   (start/end in seconds; out_path, if given, gets the full verbose_json written to disk)
// Key from env OPENAI_API_KEY or config image.openai_api_key — never from args.
// Used by: scripts/extract-voice.mjs (forced-align a known quote out of a recording),
// and the producer's caption recovery when a supplied voiceover has no word_timings.
import {
  readFileSync,
  writeFileSync,
  existsSync,
  createReadStream,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("whisper: " + m);
  process.exit(c);
};

function config() {
  const p = join(ROOT, ".video-factory", "config.json");
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

const cfg = config();
const key =
  process.env.OPENAI_API_KEY ||
  cfg.image?.openai_api_key ||
  cfg.OPENAI_API_KEY ||
  cfg.stt?.openai_api_key;
if (!key)
  fail(
    "no OpenAI API key (env OPENAI_API_KEY or config image.openai_api_key).",
    2,
  );

const req = JSON.parse(readFileSync(0, "utf8"));
if (!req.audio_path) fail("request needs {audio_path}", 2);
const audio = resolve(req.audio_path);
if (!existsSync(audio)) fail("audio not found: " + audio, 2);

const form = new FormData();
const buf = readFileSync(audio);
form.append("file", new Blob([buf]), audio.split("/").pop());
form.append("model", cfg.stt?.model || "whisper-1");
form.append("response_format", "verbose_json");
form.append("timestamp_granularities[]", "word");
form.append("timestamp_granularities[]", "segment");
if (req.language) form.append("language", req.language);

const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}` },
  body: form,
});
if (!r.ok) fail(`API ${r.status}: ${(await r.text()).slice(0, 300)}`, 1);
const j = await r.json();

const out = {
  text: j.text,
  words: (j.words || []).map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  })),
  segments: (j.segments || []).map((s) => ({
    text: s.text,
    start: s.start,
    end: s.end,
  })),
  duration: j.duration,
};
if (req.out_path)
  writeFileSync(resolve(req.out_path), JSON.stringify(j, null, 2));
log(
  `whisper: ${out.words.length} words · ${out.segments.length} segments · ${Math.round(out.duration)}s`,
);
process.stdout.write(JSON.stringify(out));

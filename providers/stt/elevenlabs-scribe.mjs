#!/usr/bin/env node
// stt adapter — ElevenLabs Scribe with WORD-LEVEL timestamps.
// Contract: providers/CONTRACTS.md (stt).
// stdin  {audio_path, out_path?, language?}
// stdout {text, words:[{word,start,end}], duration}
//   (start/end in seconds; out_path, if given, gets the same JSON written to disk)
// Key from env ELEVENLABS_API_KEY or .video-factory/config.json — never from args.
// Used by: scripts/extract-voice.mjs (forced-align a known quote out of a recording),
// and the producer's caption recovery when a supplied voiceover has no word_timings.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const fail = (m, c = 1) => {
  log("elevenlabs scribe: " + m);
  process.exit(c);
};

export function mapScribe(j) {
  const words = (j.words || [])
    .filter(
      (w) =>
        w.type === "word" &&
        typeof w.start === "number" &&
        typeof w.end === "number" &&
        String(w.text).trim(),
    )
    .map((w) => ({ word: String(w.text).trim(), start: w.start, end: w.end }));
  const duration =
    typeof j.audio_duration_secs === "number"
      ? j.audio_duration_secs
      : words.length
        ? words[words.length - 1].end
        : 0;
  return { text: j.text, words, duration };
}

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

async function main() {
  const cfg = config();
  const key = process.env.ELEVENLABS_API_KEY || cfg.ELEVENLABS_API_KEY;
  if (!key)
    fail(
      "no ELEVENLABS_API_KEY (env or .video-factory/config.json). Run /video-factory:setup.",
      2,
    );

  const req = JSON.parse(readFileSync(0, "utf8"));
  if (!req.audio_path) fail("request needs {audio_path}", 2);
  const audio = resolve(req.audio_path);
  if (!existsSync(audio)) fail("audio not found: " + audio, 2);

  const form = new FormData();
  form.append("file", new Blob([readFileSync(audio)]), audio.split("/").pop());
  form.append("model_id", cfg.stt?.scribe_model || "scribe_v3");
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  if (req.language) form.append("language_code", req.language);

  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!r.ok) fail(`API ${r.status}: ${(await r.text()).slice(0, 300)}`, 1);
  const out = mapScribe(await r.json());

  if (req.out_path)
    writeFileSync(resolve(req.out_path), JSON.stringify(out, null, 2));
  log(
    `elevenlabs scribe: ${out.words.length} words · ${Math.round(out.duration)}s`,
  );
  process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();

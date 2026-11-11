#!/usr/bin/env node
// Reference producer — what /video-factory:video does, scripted.
// For each scene: TTS-first (audio + word timings), write the MEASURED duration back into the
// manifest (so the compositor times to real audio), enforce the WPM quality gate.
// usage: node scripts/produce.mjs <project-dir>   (expects <project-dir>/manifest.json)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { estimateCost, isApproved } from "./lib/manifest-lib.mjs";
import { validate } from "./validate-manifest.mjs";
import { makeSpend, SpendRefused } from "./lib/spend.mjs";
import { lookOf } from "./palette-score.mjs";
import { beatMap } from "./beat-map.mjs";
import { snapToGrid } from "./snap-grid.mjs";

function alignDisplayWords(displayScript, phoneticTimings) {
  const displayWords = (displayScript || "").trim().split(/\s+/).filter(Boolean);
  if (!displayWords.length || !phoneticTimings?.length) return phoneticTimings || [];
  if (displayWords.length === phoneticTimings.length) {
    return phoneticTimings.map((t, idx) => ({ ...t, word: displayWords[idx] }));
  }
  // Proportional span projection when phonetic token count differs from display token count
  const totalPh = phoneticTimings.length;
  return displayWords.map((word, idx) => {
    const startIdx = Math.min(totalPh - 1, Math.floor((idx * totalPh) / displayWords.length));
    const endIdx = Math.min(totalPh - 1, Math.max(startIdx, Math.ceil(((idx + 1) * totalPh) / displayWords.length) - 1));
    return {
      word,
      start_ms: phoneticTimings[startIdx].start_ms,
      end_ms: phoneticTimings[endIdx].end_ms,
    };
  });
}

function synthesizeWordTimings(text, duration_ms) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || !duration_ms) return [];
  const weights = words.map(w => {
    let weight = Math.max(1, w.length);
    if (/[,;]/.test(w)) weight += 2;
    if (/[.!?]/.test(w)) weight += 4;
    return weight;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const padStart = Math.min(150, Math.floor(duration_ms * 0.05));
  const availableDur = Math.max(100, duration_ms - padStart * 2);
  let currentMs = padStart;
  return words.map((word, i) => {
    const wordDur = Math.max(120, Math.round((weights[i] / totalWeight) * availableDur));
    const start_ms = currentMs;
    const end_ms = Math.min(duration_ms - 20, start_ms + wordDur);
    currentMs = end_ms + 30;
    return { word, start_ms, end_ms };
  });
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projDir = resolve(process.argv[2] || ".");
const manifestPath = join(projDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tone = manifest.brand?.tone || "";

mkdirSync(join(projDir, "audio"), { recursive: true });

const reg = JSON.parse(
  readFileSync(join(ROOT, "providers/providers.json"), "utf8"),
);
const adapterPath = (cap, name) =>
  join(ROOT, reg.capabilities[cap].adapters[name].path);

// ── gates before any spend ─────────────────────────────────────────────────────────────
// The plan must pass its audit, and if it will make a paid call it must carry an approval
// that still matches its content. Both are checked here, in the runner.
const audit = validate(manifest, { registry: reg });
for (const w of audit.warnings)
  process.stderr.write(`  warn [${w.gate}] ${w.scene ?? ""} ${w.message}\n`);
if (!audit.pass) {
  for (const e of audit.errors)
    process.stderr.write(`  ERROR [${e.gate}] ${e.scene ?? ""} ${e.message}\n`);
  process.stderr.write("produce: the plan fails its audit (scripts/validate-manifest.mjs); nothing was run\n");
  process.exit(1);
}
const planned = estimateCost(manifest, reg);
if (planned.calls.length && !isApproved(manifest)) {
  process.stderr.write(
    `produce: ${planned.calls.length} paid call(s) planned and the plan is ${manifest.approval ? "changed since it was approved" : "not approved"}.\n` +
      `  Show the storyboard to a person, then: node scripts/approve.mjs ${projDir} --by "<name>"\n`,
  );
  process.exit(3);
}
const spend = makeSpend({ projDir, manifest, registry: reg });
process.on("uncaughtException", (e) => {
  if (e instanceof SpendRefused) {
    save(); // keep what was produced so the run resumes
    process.stderr.write(`produce: stopped before spending: ${e.message}\n`);
    process.exit(4);
  }
  try {
    save(); // keep what was produced so a resumed run does not pay for it twice
  } catch {}
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exit(1);
});
const styleSuffix = manifest.brand?.style_suffix ? ` ${manifest.brand.style_suffix.trim()}` : "";
const lookRefs = manifest.brand?.look_ref ? [join(projDir, manifest.brand.look_ref)] : undefined;
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const lookCheck = (s, rel) => {
  try {
    s._look = lookOf(join(projDir, rel), manifest.brand?.palette);
    const min = manifest.brand?.palette_min_score ?? 60;
    if (typeof s._look.palette_score === "number" && s._look.palette_score < min)
      process.stderr.write(`  ${s.id}: ⚠️ palette score ${s._look.palette_score} < ${min}: remake it, do not grade it\n`);
  } catch (e) {
    process.stderr.write(`  ${s.id}: look check skipped: ${String(e).slice(0, 80)}\n`);
  }
};

const tts = (req) => {
  const prov = manifest.provider_assignments?.tts || reg.capabilities?.tts?.default || "elevenlabs";
  const primaryAdapter = adapterPath("tts", prov);
  try {
    const res = spend("tts", prov, { scene: req.scene, seconds: req.est_seconds ?? 0 }, () =>
      JSON.parse(
        execFileSync("node", [primaryAdapter], {
          input: JSON.stringify(req),
          encoding: "utf8",
        }),
      ),
    );
    if (!res.word_timings || res.word_timings.length === 0) {
      res.word_timings = synthesizeWordTimings(req.text, res.duration_ms);
    }
    return res;
  } catch (err) {
    if (err instanceof SpendRefused) throw err;
    const fallback = reg.capabilities?.tts?.fallback || "say";
    process.stderr.write(`  TTS ${prov} failed (${String(err).slice(0, 60)}); falling back to ${fallback}...\n`);
    const fbPath = adapterPath("tts", fallback);
    const isSh = fbPath.endsWith(".sh");
    const cmd = isSh ? fbPath : "node";
    const args = isSh ? [] : [fbPath];
    const res = spend("tts", fallback, { scene: req.scene, seconds: req.est_seconds ?? 0 }, () =>
      JSON.parse(
        execFileSync(cmd, args, {
          input: JSON.stringify(req),
          encoding: "utf8",
        }),
      ),
    );
    if (!res.word_timings || res.word_timings.length === 0) {
      res.word_timings = synthesizeWordTimings(req.text, res.duration_ms);
    }
    return res;
  }
};

const scenes = manifest.scenes || [];
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];

  // real-voice voiceover — a scene can supply a pre-recorded clip (e.g. the speaker's ACTUAL
  // voice pulled from a recording via scripts/extract-voice.mjs) instead of TTS. Use it as the
  // scene audio, measure its real duration, and recover caption word-timings via STT if absent.
  if (s.voiceover && !s._audio) {
    const vp = join(projDir, s.voiceover);
    s._audio = s.voiceover;
    s.duration_ms = Math.round(
      parseFloat(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          vp,
        ]).toString(),
      ) * 1000,
    );
    if (!s.word_timings && s.captions !== "none") {
      try {
        const r = JSON.parse(
          execFileSync(
            "node",
            [adapterPath("stt", reg.capabilities.stt.default)],
            {
              input: JSON.stringify({ audio_path: vp }),
              encoding: "utf8",
            },
          ),
        );
        s.word_timings = (r.words || []).map((w) => ({
          word: w.word.trim(),
          start_ms: Math.round(w.start * 1000),
          end_ms: Math.round(w.end * 1000),
        }));
      } catch (e) {
        process.stderr.write(
          `  ${s.id}: voiceover stt skipped: ${String(e).slice(0, 80)}\n`,
        );
      }
    }
    process.stderr.write(
      `  ${s.id}: voiceover ${s.duration_ms}ms (real voice)${s.word_timings ? ` · ${s.word_timings.length} words` : ""}\n`,
    );
  }

  // narration — skip silent / clip-only scenes (idempotent: skip if already produced)
  // Ear vs eye decoupling: use s.tts_phonetic for spoken audio if provided, keeping s.tts_script for captions
  if ((s.tts_script || s.tts_phonetic) && !s._audio) {
    const spokenText = (s.tts_phonetic || s.tts_script || "").trim();
    if (spokenText) {
      const r = tts({
        text: spokenText,
        tone,
        prev_text: scenes[i - 1]?.tts_phonetic || scenes[i - 1]?.tts_script,
        next_text: scenes[i + 1]?.tts_phonetic || scenes[i + 1]?.tts_script,
        out_path: join(projDir, "audio", `${s.id}.mp3`),
        scene: s.id,
        est_seconds: s.duration_estimate_s ?? 4,
      });
      const rawTimings = s.tts_phonetic && s.tts_script
        ? alignDisplayWords(s.tts_script, r.word_timings)
        : r.word_timings;
      s.duration_ms = r.duration_ms; // TTS-first write-back
      s.word_timings = (rawTimings || []).map((t) => ({
        ...t,
        start_ms: Math.min(t.start_ms, Math.max(0, s.duration_ms - 20)),
        end_ms: Math.min(t.end_ms, s.duration_ms),
      }));
      const words = (spokenText.match(/\S+/g) || []).length;
      const wpm = words / (r.duration_ms / 60000);
      const [lo, hi] = s.quality_gate?.speaking_rate_wpm || [120, 180];
      const flag =
        wpm < lo || wpm > hi
          ? `  ⚠️ WPM ${wpm.toFixed(0)} outside [${lo},${hi}]`
          : "";
      process.stderr.write(
        `  ${s.id}: tts ${r.duration_ms}ms · ${r.word_timings.length} words · ${wpm.toFixed(0)} wpm${flag}${s.tts_phonetic ? " (phonetic)" : ""}\n`,
      );
      save();
    }
  }

  // generative b-roll — clip scenes with no supplied asset
  if (s.visual?.source === "clip" && !s.visual.asset) {
    const brief = (s.visual.visual_brief || s.title || s.tts_script) + styleSuffix;
    const aspect = manifest.format?.[0] || "16:9";

    // reference-frame locking: generate a still and seed the clip with it (i2v).
    // Locks composition/look before paying for video — ~40%→80% first-try. Opt out via ref_lock:false.
    let refFrame = s.continuity_refs?.[0];
    const lock = s.visual.ref_lock ?? manifest.brand?.ref_lock ?? true;
    if (!refFrame && lock) {
      const iprov =
        s.provider_assignments?.image || reg.capabilities.image.default;
      const ir = spend("image", iprov, { scene: s.id }, () =>
        JSON.parse(
          execFileSync("node", [adapterPath("image", iprov)], {
            input: JSON.stringify({
              brief,
              aspect,
              refs: lookRefs,
              out_path: join(projDir, "frames", `${s.id}.png`),
            }),
            encoding: "utf8",
          }),
        ),
      );
      refFrame = ir.image_path;
      lookCheck(s, `frames/${s.id}.png`);
      process.stderr.write(`  ${s.id}: ref-frame via ${iprov}\n`);
    }

    const prov = s.provider_assignments?.clip || reg.capabilities.clip.default;
    const clipS = s.duration_ms ? Math.round(s.duration_ms / 1000) : 6;
    const r = spend("clip", prov, { scene: s.id, seconds: clipS }, () =>
      JSON.parse(
        execFileSync("node", [adapterPath("clip", prov)], {
          input: JSON.stringify({
            brief,
            aspect,
            duration_s: clipS,
            ref_frame: refFrame,
            out_path: join(projDir, "clips", `${s.id}.mp4`),
          }),
          encoding: "utf8",
        }),
      ),
    );
    s.visual.asset = `clips/${s.id}.mp4`;
    s.visual._generated = true;
    save();
    if (!s.duration_ms) s.duration_ms = r.duration_ms;
    process.stderr.write(
      `  ${s.id}: clip via ${prov}${refFrame ? " (i2v from ref)" : ""} · ${r.duration_ms}ms\n`,
    );
  }

  // generative image scenes (source:image, no supplied asset).
  // Text-heavy briefs (charts/labels/UI/words) auto-route to gpt-image — far better at text-in-image.
  if (s.visual?.source === "image" && !s.visual.asset) {
    const brief = (s.visual.visual_brief || s.title || "") + styleSuffix;
    const textHeavy =
      /\b(text|label|chart|diagram|graph|word|title|caption|number|stat|sign|logo|ui|screen|interface|headline|menu|axis|radar)\b/i.test(
        brief,
      );
    let iprov = s.provider_assignments?.image || reg.capabilities.image.default;
    if (textHeavy && reg.capabilities.image.adapters["gpt-image"])
      iprov = "gpt-image";
    const ir = spend("image", iprov, { scene: s.id }, () =>
      JSON.parse(
        execFileSync("node", [adapterPath("image", iprov)], {
          input: JSON.stringify({
            brief,
            aspect: manifest.format?.[0] || "16:9",
            refs: lookRefs,
            out_path: join(projDir, "assets", `${s.id}.png`),
          }),
          encoding: "utf8",
        }),
      ),
    );
    s.visual.asset = `assets/${s.id}.png`;
    s.visual._generated = true;
    lookCheck(s, s.visual.asset);
    save();
    process.stderr.write(
      `  ${s.id}: image via ${iprov}${textHeavy ? " (text-heavy)" : ""}\n`,
    );
  }

  // sfx — generate one-shots from briefs (s.sfx: string[]) → s._sfx (paths)
  if (Array.isArray(s.sfx) && s.sfx.length && !s._sfx) {
    s._sfx = [];
    const sprov = reg.capabilities.sfx.default;
    s.sfx.forEach((brief, k) => {
      try {
        spend("sfx", sprov, { scene: s.id }, () => {
          execFileSync("node", [adapterPath("sfx", sprov)], {
            input: JSON.stringify({
              brief,
              out_path: join(projDir, "audio", `${s.id}-sfx${k}.mp3`),
            }),
            encoding: "utf8",
          });
          return {};
        });
        s._sfx.push(`audio/${s.id}-sfx${k}.mp3`);
      } catch (e) {
        if (e instanceof SpendRefused) throw e;
        process.stderr.write(
          `  ${s.id}: sfx skipped: ${String(e).slice(0, 80)}\n`,
        );
      }
    });
    process.stderr.write(`  ${s.id}: sfx ×${s._sfx.length} via ${sprov}\n`);
  }
}

// music bed for the whole video (sound design — layer 4)
if (!manifest.music) {
  const total = scenes.reduce(
    (a, s) => a + (s.duration_ms ?? (s.duration_estimate_s ?? 4) * 1000),
    0,
  );
  const musicBrief =
    manifest.brand?.music_style ||
    "calm cinematic underscore, subtle and unobtrusive";
  const mprov = reg.capabilities.music.default;
  try {
    // room for the holds snap-grid adds so every cut lands on a beat
    const bedMs = total + scenes.length * 900;
    const mr = spend("music", mprov, { seconds: bedMs / 1000 }, () =>
      JSON.parse(
        execFileSync("node", [adapterPath("music", mprov)], {
          input: JSON.stringify({
            brief: musicBrief,
            duration_ms: bedMs,
            out_path: join(projDir, "audio", "music.mp3"),
          }),
          encoding: "utf8",
        }),
      ),
    );
    manifest.music = "audio/music.mp3";
    manifest._music_generated = true;
    process.stderr.write(`  music: ${mprov} · ${mr.duration_ms}ms\n`);
  } catch (e) {
    if (e instanceof SpendRefused) throw e;
    process.stderr.write(`  music skipped: ${String(e).slice(0, 120)}\n`);
  }
}

// the grid: measure the bed's beats and hold each scene so its cut lands on one
if (manifest.music && !manifest.grid) {
  try {
    const beats = beatMap(join(projDir, manifest.music));
    const r = snapToGrid(manifest, beats);
    process.stderr.write(
      manifest.grid.snapped
        ? `  grid: ${beats.bpm} BPM · ${r.snapped} cuts on beats · ${r.held_ms}ms of holds\n`
        : `  grid: not snapped (${manifest.grid.reason}); cuts stay on word boundaries\n`,
    );
  } catch (e) {
    process.stderr.write(`  grid skipped: ${String(e).slice(0, 120)}\n`);
  }
}

save();
process.stdout.write(`produced ${scenes.length} scenes → ${manifestPath}\n`);

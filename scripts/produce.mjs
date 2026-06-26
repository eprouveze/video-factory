#!/usr/bin/env node
// Reference producer — what /video-factory:video does, scripted.
// For each scene: TTS-first (audio + word timings), write the MEASURED duration back into the
// manifest (so the compositor times to real audio), enforce the WPM quality gate.
// usage: node scripts/produce.mjs <project-dir>   (expects <project-dir>/manifest.json)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projDir = resolve(process.argv[2] || ".");
const manifestPath = join(projDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tone = manifest.brand?.tone || "";
const TTS = join(ROOT, "providers/tts/elevenlabs.mjs");

mkdirSync(join(projDir, "audio"), { recursive: true });

const tts = (req) =>
  JSON.parse(
    execFileSync("node", [TTS], {
      input: JSON.stringify(req),
      encoding: "utf8",
    }),
  );

const reg = JSON.parse(
  readFileSync(join(ROOT, "providers/providers.json"), "utf8"),
);
const adapterPath = (cap, name) =>
  join(ROOT, reg.capabilities[cap].adapters[name].path);

const scenes = manifest.scenes || [];
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];

  // narration — skip silent / clip-only scenes (idempotent: skip if already produced)
  if (s.tts_script && s.tts_script.trim() && !s._audio) {
    const r = tts({
      text: s.tts_script,
      tone,
      prev_text: scenes[i - 1]?.tts_script,
      next_text: scenes[i + 1]?.tts_script,
      out_path: join(projDir, "audio", `${s.id}.mp3`),
    });
    s._audio = `audio/${s.id}.mp3`; // relative to projDir; compositor stages it into public/
    s.word_timings = r.word_timings;
    s.duration_ms = r.duration_ms; // TTS-first write-back
    const words = (s.tts_script.match(/\S+/g) || []).length;
    const wpm = words / (r.duration_ms / 60000);
    const [lo, hi] = s.quality_gate?.speaking_rate_wpm || [120, 180];
    const flag =
      wpm < lo || wpm > hi
        ? `  ⚠️ WPM ${wpm.toFixed(0)} outside [${lo},${hi}]`
        : "";
    process.stderr.write(
      `  ${s.id}: tts ${r.duration_ms}ms · ${r.word_timings.length} words · ${wpm.toFixed(0)} wpm${flag}\n`,
    );
  }

  // generative b-roll — clip scenes with no supplied asset
  if (s.visual?.source === "clip" && !s.visual.asset) {
    const brief = s.visual.visual_brief || s.title || s.tts_script;
    const aspect = manifest.format?.[0] || "16:9";

    // reference-frame locking: generate a still and seed the clip with it (i2v).
    // Locks composition/look before paying for video — ~40%→80% first-try. Opt out via ref_lock:false.
    let refFrame = s.continuity_refs?.[0];
    const lock = s.visual.ref_lock ?? manifest.brand?.ref_lock ?? true;
    if (!refFrame && lock) {
      const iprov =
        s.provider_assignments?.image || reg.capabilities.image.default;
      const ir = JSON.parse(
        execFileSync("node", [adapterPath("image", iprov)], {
          input: JSON.stringify({
            brief,
            aspect,
            out_path: join(projDir, "frames", `${s.id}.png`),
          }),
          encoding: "utf8",
        }),
      );
      refFrame = ir.image_path;
      process.stderr.write(`  ${s.id}: ref-frame via ${iprov}\n`);
    }

    const prov = s.provider_assignments?.clip || reg.capabilities.clip.default;
    const r = JSON.parse(
      execFileSync("node", [adapterPath("clip", prov)], {
        input: JSON.stringify({
          brief,
          aspect,
          duration_s: s.duration_ms ? Math.round(s.duration_ms / 1000) : 6,
          ref_frame: refFrame,
          out_path: join(projDir, "clips", `${s.id}.mp4`),
        }),
        encoding: "utf8",
      }),
    );
    s.visual.asset = `clips/${s.id}.mp4`;
    if (!s.duration_ms) s.duration_ms = r.duration_ms;
    process.stderr.write(
      `  ${s.id}: clip via ${prov}${refFrame ? " (i2v from ref)" : ""} · ${r.duration_ms}ms\n`,
    );
  }

  // sfx — generate one-shots from briefs (s.sfx: string[]) → s._sfx (paths)
  if (Array.isArray(s.sfx) && s.sfx.length && !s._sfx) {
    s._sfx = [];
    const sprov = reg.capabilities.sfx.default;
    s.sfx.forEach((brief, k) => {
      try {
        execFileSync("node", [adapterPath("sfx", sprov)], {
          input: JSON.stringify({
            brief,
            out_path: join(projDir, "audio", `${s.id}-sfx${k}.mp3`),
          }),
          encoding: "utf8",
        });
        s._sfx.push(`audio/${s.id}-sfx${k}.mp3`);
      } catch (e) {
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
    const mr = JSON.parse(
      execFileSync("node", [adapterPath("music", mprov)], {
        input: JSON.stringify({
          brief: musicBrief,
          duration_ms: total,
          out_path: join(projDir, "audio", "music.mp3"),
        }),
        encoding: "utf8",
      }),
    );
    manifest.music = "audio/music.mp3";
    process.stderr.write(`  music: ${mprov} · ${mr.duration_ms}ms\n`);
  } catch (e) {
    process.stderr.write(`  music skipped: ${String(e).slice(0, 120)}\n`);
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(`produced ${scenes.length} scenes → ${manifestPath}\n`);

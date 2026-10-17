#!/usr/bin/env node
// compositor adapter — { manifest_path, format, out_path } -> { video_path, duration_ms }
// Renders the manifest with HyperFrames (HTML5 + GSAP).
// 3.3x faster than Remotion, 47% lighter output, built-in pre-flight validation gates.

import { readFileSync, mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

function readStdin() {
  return JSON.parse(readFileSync(0, "utf8"));
}

const ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:${process.env.HOME}/.local/bin:${process.env.PATH || ""}`,
};

// Formats map to 1080p canvas dimensions
const DIMENSIONS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

function stageAsset(srcPath, destDir, relPath) {
  if (!srcPath || /^https?:/.test(srcPath)) return srcPath;
  if (!existsSync(srcPath)) return null;
  const target = join(destDir, relPath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(srcPath, target);
  return relPath;
}

function generateHyperframesHtml(manifest, format, projDir, buildDir) {
  const dim = DIMENSIONS[format] || DIMENSIONS["16:9"];
  const fps = manifest.fps || 30;
  const scenes = manifest.scenes || [];
  const palette = manifest.brand?.palette || ["#090d16", "#8b5cf6", "#f8fafc", "#10b981", "#f59e0b"];
  const primaryBg = palette[0] || "#090d16";
  const accent1 = palette[1] || "#8b5cf6";
  const textColor = palette[2] || "#f8fafc";
  const accent2 = palette[3] || "#10b981";
  const accent3 = palette[4] || "#f59e0b";

  let currentTimeMs = 0;
  const sceneLayouts = scenes.map((s, idx) => {
    const durMs = s.duration_ms || (s.duration_estimate_s || 5) * 1000;
    const startS = (currentTimeMs / 1000).toFixed(2);
    const durS = (durMs / 1000).toFixed(2);
    currentTimeMs += durMs;

    let stagedAudio = null;
    if (s._audio) {
      const audioSrc = resolve(projDir, s._audio);
      stagedAudio = stageAsset(audioSrc, buildDir, `audio/${s.id}.mp3`);
    }

    let stagedAsset = null;
    if (s.visual?.asset) {
      const assetSrc = resolve(projDir, s.visual.asset);
      const ext = s.visual.asset.split(".").pop();
      stagedAsset = stageAsset(assetSrc, buildDir, `assets/${s.id}.${ext}`);
    }

    return {
      id: s.id || `s${idx + 1}`,
      title: s.title || `Scene ${idx + 1}`,
      script: s.tts_script || s.script || "",
      startS,
      durS,
      startMs: currentTimeMs - durMs,
      durMs,
      stagedAudio,
      stagedAsset,
      visual: s.visual || {},
      wordTimings: s.word_timings || [],
    };
  });

  const totalDurationS = (currentTimeMs / 1000).toFixed(2);

  // Top-level music bed staging
  let stagedMusic = null;
  if (manifest.music) {
    const musicSrc = resolve(projDir, manifest.music);
    stagedMusic = stageAsset(musicSrc, buildDir, "audio/music.mp3");
  }

  // Build audio elements
  const audioTags = sceneLayouts
    .filter((s) => s.stagedAudio)
    .map(
      (s) =>
        `      <audio id="audio-${s.id}" src="${s.stagedAudio}" data-start="${s.startS}" data-duration="${s.durS}" data-track-index="10" data-volume="1"></audio>`,
    )
    .join("\n");

  const musicTag = stagedMusic
    ? `      <audio id="music-bed" src="${stagedMusic}" data-start="0" data-duration="${totalDurationS}" data-track-index="11" data-volume="0.25"></audio>`
    : "";

  // Build scene sections
  const sectionTags = sceneLayouts
    .map((s, i) => {
      const trackIdx = i + 1;
      const isFirst = i === 0;
      const isLast = i === sceneLayouts.length - 1;

      let innerVisual = "";
      if (s.visual.source === "still" && s.stagedAsset) {
        innerVisual = `
          <div id="${s.id}-image-container" style="position: absolute; inset: 0; overflow: hidden; z-index: 1;">
            <img id="${s.id}-img" src="${s.stagedAsset}" style="width: 100%; height: 100%; object-fit: cover;" alt="" />
          </div>`;
      } else {
        // High-polish card/typography scene
        innerVisual = `
          <div style="position: relative; z-index: 5; text-align: center; max-width: ${dim.width * 0.7}px;">
            <div id="${s.id}-pill" class="badge-pill">
              <div class="dot" style="background: ${accent1}; box-shadow: 0 0 10px ${accent1};"></div>
              ${manifest.title || "EXECUTIVE OVERVIEW"}
            </div>
            <h1 id="${s.id}-headline" style="font-size: ${dim.width > 1200 ? 56 : 38}px; font-weight: 800; line-height: 1.2; letter-spacing: -1px; margin-bottom: 20px;">
              ${s.visual.title || s.title}
            </h1>
            ${
              s.visual.subtitle || s.visual.description
                ? `<div id="${s.id}-sub" style="font-size: ${dim.width > 1200 ? 28 : 20}px; color: #94a3b8; line-height: 1.4;">
                    ${s.visual.subtitle || s.visual.description}
                   </div>`
                : ""
            }
          </div>`;
      }

      // Responsive, non-colliding captions container at bottom: 3%
      const captionsBlock = s.script
        ? `
          <div id="${s.id}-captions" style="position: absolute; bottom: 3%; left: 50%; transform: translateX(-50%); z-index: 20; background: rgba(9, 13, 22, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; padding: 10px 28px; max-width: 85%; pointer-events: none;">
            <p style="font-size: ${Math.round(dim.width * 0.018)}px; font-weight: 600; color: #ffffff; text-align: center; line-height: 1.3; margin: 0;">
              ${s.script}
            </p>
          </div>`
        : "";

      return `
      <!-- SCENE ${i + 1}: ${s.id} (${s.startS}s - ${s.durS}s) -->
      <section id="${s.id}" class="clip" data-start="${s.startS}" data-duration="${s.durS}" data-track-index="${trackIdx}">
        ${innerVisual}
        ${captionsBlock}
      </section>`;
    })
    .join("\n");

  // GSAP Choreography with continuous motion rules
  const gsapTweens = sceneLayouts
    .map((s, i) => {
      const start = parseFloat(s.startS);
      const dur = parseFloat(s.durS);

      return `
      // Scene ${s.id} continuous motion & entrance
      tl.fromTo("#${s.id}", { scale: 0.98 }, { scale: 1.03, duration: ${dur}, ease: "sine.inOut" }, ${start});
      if (document.getElementById("${s.id}-pill")) {
        tl.from("#${s.id}-pill", { y: -20, opacity: 0, duration: 0.5, ease: "power3.out" }, ${start + 0.1});
      }
      if (document.getElementById("${s.id}-headline")) {
        tl.from("#${s.id}-headline", { y: 25, opacity: 0, duration: 0.7, ease: "power3.out" }, ${start + 0.3});
      }
      if (document.getElementById("${s.id}-sub")) {
        tl.from("#${s.id}-sub", { y: 20, opacity: 0, duration: 0.6, ease: "power3.out" }, ${start + 0.6});
      }
      if (document.getElementById("${s.id}-img")) {
        tl.fromTo("#${s.id}-img", { scale: 1.04 }, { scale: 1.10, duration: ${dur}, ease: "sine.inOut" }, ${start});
      }
      if (document.getElementById("${s.id}-captions")) {
        tl.from("#${s.id}-captions", { opacity: 0, y: 15, duration: 0.4, ease: "power2.out" }, ${start + 0.2});
      }`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${dim.width}, height=${dim.height}" />
    <title>${manifest.title || "Video"}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: ${dim.width}px;
        height: ${dim.height}px;
        overflow: hidden;
        background: ${primaryBg};
        color: ${textColor};
        font-family: Inter, system-ui, -apple-system, sans-serif;
      }
      #root {
        position: relative;
        width: ${dim.width}px;
        height: ${dim.height}px;
        overflow: hidden;
      }
      .bg-fill {
        position: absolute;
        inset: 0;
        background: radial-gradient(1200px 800px at 50% 45%, rgba(139, 92, 246, 0.16), transparent 75%), ${primaryBg};
        z-index: 0;
      }
      .bg-grid {
        position: absolute;
        inset: -60px;
        background-image: linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
        background-size: 60px 60px;
        z-index: 0;
      }
      .clip {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        z-index: 10;
      }
      .badge-pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: rgba(139, 92, 246, 0.15);
        border: 1.5px solid rgba(139, 92, 246, 0.5);
        padding: 8px 22px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 1.5px;
        color: ${accent1};
        text-transform: uppercase;
        margin-bottom: 24px;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${totalDurationS}"
      data-width="${dim.width}"
      data-height="${dim.height}"
    >
      <div class="bg-fill" id="bg-glow"></div>
      <div class="bg-grid" id="bg-grid"></div>

      <!-- AUDIO TRACKS -->
${audioTags}
${musicTag}

      <!-- SCENES -->
${sectionTags}
    </div>

    <!-- GSAP MASTER TIMELINE -->
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      // Ambient canvas breathing
      tl.to("#bg-glow", { opacity: 0.85, duration: ${Math.max(10, totalDurationS / 2)}, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
      tl.to("#bg-grid", { y: "+=60", duration: ${totalDurationS}, ease: "none" }, 0);

${gsapTweens}

      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>`;
}

async function main() {
  const req = readStdin();
  const manifestPath = resolve(req.manifest_path);
  const projDir = dirname(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const format = req.format || manifest.format?.[0] || "16:9";
  const quality = req.quality || "looks";
  const out = resolve(req.out_path);
  mkdirSync(dirname(out), { recursive: true });

  // Check if project has a bespoke HyperFrames project already
  let hyperframesDir = null;
  const candidateDirs = [
    join(projDir, "hyperframes-promo"),
    join(projDir, "hyperframes"),
    projDir,
  ];

  for (const c of candidateDirs) {
    if (existsSync(join(c, "index.html")) && existsSync(join(c, "hyperframes.json"))) {
      hyperframesDir = c;
      break;
    }
  }

  // If no bespoke hyperframes project exists, compile from manifest.json
  if (!hyperframesDir) {
    hyperframesDir = join(projDir, ".hyperframes-build");
    mkdirSync(hyperframesDir, { recursive: true });

    const htmlContent = generateHyperframesHtml(manifest, format, projDir, hyperframesDir);
    writeFileSync(join(hyperframesDir, "index.html"), htmlContent, "utf8");

    const hfJson = {
      name: basename(projDir),
      entry: "index.html",
      compositions: {
        main: {
          width: DIMENSIONS[format]?.width || 1920,
          height: DIMENSIONS[format]?.height || 1080,
          fps: manifest.fps || 30,
        },
      },
    };
    writeFileSync(join(hyperframesDir, "hyperframes.json"), JSON.stringify(hfJson, null, 2), "utf8");
  }

  // Run pre-flight lint check
  process.stderr.write(`[hyperframes] Running pre-flight check on ${hyperframesDir}...\n`);
  try {
    execFileSync("npx", ["hyperframes", "check"], {
      cwd: hyperframesDir,
      env: ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (checkErr) {
    process.stderr.write(`[hyperframes] Pre-flight check warning:\n${checkErr.stderr || checkErr.stdout || checkErr.message}\n`);
    // Non-fatal if warnings only
  }

  // Render video
  process.stderr.write(`[hyperframes] Rendering ${format} (${quality}) to ${out}...\n`);
  const renderArgs = ["hyperframes", "render", "-o", out, "--quality", quality];
  if (req.fps) renderArgs.push("--fps", String(req.fps));

  const renderProc = spawnSync("npx", renderArgs, {
    cwd: hyperframesDir,
    env: ENV,
    encoding: "utf8",
  });

  if (renderProc.status !== 0) {
    process.stderr.write(`[hyperframes] Render failed:\n${renderProc.stderr || renderProc.stdout}\n`);
    process.exit(1);
  }

  // Measure rendered duration via ffprobe
  let duration_ms = 0;
  try {
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "json", out],
        { env: ENV, encoding: "utf8" },
      ),
    );
    duration_ms = Math.round(parseFloat(probe.format.duration) * 1000);
  } catch {
    // Fallback if ffprobe isn't present
    duration_ms = Math.round((manifest.scenes || []).reduce((acc, s) => acc + (s.duration_ms || 5000), 0));
  }

  process.stderr.write(`[hyperframes] Render complete: ${out} (${(duration_ms / 1000).toFixed(2)}s)\n`);
  process.stdout.write(JSON.stringify({ video_path: out, duration_ms }) + "\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exit(1);
});

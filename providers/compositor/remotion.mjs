#!/usr/bin/env node
// compositor adapter — { manifest_path, format, out_path } -> { video_path, duration_ms }
// Renders the manifest with Remotion. Zero-key: code-source scenes need no assets/keys.
import { readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REMOTION = resolve(HERE, "../../remotion");
const PUBLIC = join(REMOTION, "public");

function readStdin() {
  return JSON.parse(readFileSync(0, "utf8"));
}

// Copy a project-relative asset into remotion/public/<same path> so staticFile() resolves it.
function stage(projDir, relPath) {
  if (!relPath || /^https?:/.test(relPath)) return;
  const src = resolve(projDir, relPath);
  if (!existsSync(src)) return;
  const dst = join(PUBLIC, relPath);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}

async function main() {
  const req = readStdin();
  const manifestPath = resolve(req.manifest_path);
  const projDir = dirname(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const format = req.format || manifest.format?.[0] || "16:9";

  stage(projDir, manifest.music); // top-level music bed
  for (const s of manifest.scenes ?? []) {
    stage(projDir, s._audio);
    stage(projDir, s.visual?.asset);
    stage(projDir, s.music);
    (s.sfx ?? []).forEach((p) => stage(projDir, p));
  }

  // @remotion/* live in remotion/node_modules; this adapter sits outside it.
  const rrequire = createRequire(join(REMOTION, "package.json"));
  const bundlerMod = await import(
    pathToFileURL(rrequire.resolve("@remotion/bundler")).href
  );
  const rendererMod = await import(
    pathToFileURL(rrequire.resolve("@remotion/renderer")).href
  );
  const bundle = bundlerMod.bundle ?? bundlerMod.default?.bundle;
  const selectComposition =
    rendererMod.selectComposition ?? rendererMod.default?.selectComposition;
  const renderMedia =
    rendererMod.renderMedia ?? rendererMod.default?.renderMedia;

  const serveUrl = await bundle({
    entryPoint: join(REMOTION, "src/index.ts"),
    publicDir: PUBLIC,
  });

  const inputProps = { manifest, format };
  const composition = await selectComposition({
    serveUrl,
    id: "Video",
    inputProps,
  });

  const out = resolve(req.out_path);
  mkdirSync(dirname(out), { recursive: true });
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: out,
    inputProps,
  });

  const duration_ms = Math.round(
    (composition.durationInFrames / composition.fps) * 1000,
  );
  process.stdout.write(JSON.stringify({ video_path: out, duration_ms }) + "\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exit(1);
});

#!/usr/bin/env node
// image adapter — Nano Banana Pro (`gemini-3-pro-image`) through the same Gemini
// Interactions wire format as gemini.mjs, at 2K.
//
// Same contract as the `image` capability (providers/CONTRACTS.md); registered separately so
// a scene can opt into the quality tier through `provider_assignments` without changing the
// default for every project. Opt in with: "provider_assignments": {"image": "nano-banana-pro"}.
//
// The overrides must be set before the shared implementation loads: gemini.mjs reads config
// first and env second, so a machine that sets `image.model` in .video-factory/config.json
// still wins over this default.
process.env.VF_IMAGE_MODEL = process.env.VF_IMAGE_MODEL || "gemini-3-pro-image";
process.env.VF_IMAGE_SIZE = process.env.VF_IMAGE_SIZE || "2K";

// gemini.mjs only self-runs when it is argv[1]; invoked through this wrapper it does not, so
// main() is called explicitly here.
const { main } = await import("./gemini.mjs");
await main();

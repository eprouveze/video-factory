// Shared image-format helpers for the image adapters.
//
// Two failure modes this module exists to prevent, both found by the 2026-11-23 bake-off:
//
// 1. A provider returns JPEG bytes and the adapter writes them to a `.png` path. Nothing
//    breaks at write time; it breaks later, when the file is fed back as a reference and a
//    MIME type is derived from the extension (image/png wrapping JPEG data).
// 2. A reference is trusted by its extension when its actual bytes say otherwise.
//
// So: sniff the bytes, never trust the name alone.

const MAGIC = [
  {
    mime: "image/png",
    ext: ".png",
    test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47,
  },
  {
    mime: "image/jpeg",
    ext: ".jpg",
    test: (b) =>
      b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/webp",
    ext: ".webp",
    test: (b) =>
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
];

/** Returns "image/png" | "image/jpeg" | "image/webp" | null for a Buffer of image bytes. */
export function sniffImageMime(buf) {
  for (const m of MAGIC) if (m.test(buf)) return m.mime;
  return null;
}

/** The file extension that matches a MIME type, or null. */
export function extensionForMime(mime) {
  return MAGIC.find((m) => m.mime === mime)?.ext ?? null;
}

/**
 * Returns `path` if its extension already matches `mime`, otherwise the same path with the
 * correct extension. Used by adapters so the returned `image_path` always tells the truth
 * about its own bytes.
 */
export function pathMatchingMime(path, mime) {
  const ext = extensionForMime(mime);
  if (!ext) return path;
  const current = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (current === ext || (ext === ".jpg" && current === ".jpeg")) return path;
  const stem = path.slice(0, path.lastIndexOf("."));
  return stem + ext;
}

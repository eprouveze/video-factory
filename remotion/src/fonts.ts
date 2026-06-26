// Load the brand font so `fontFamily: "Inter, ..."` resolves to the real font
// (not a silent system fallback). Side-effect import from index.ts.
import { loadFont } from "@remotion/google-fonts/Inter";

export const { fontFamily } = loadFont();

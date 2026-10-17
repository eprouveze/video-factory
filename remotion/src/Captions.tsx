import { useCurrentFrame, useVideoConfig } from "remotion";

// Word-level animated captions: highlight the spoken word, dim its neighbours.
// Mobile-first sizing, high-contrast stroke. Reads real STT word_timings.
export const Captions = ({ words, brand }: any) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const activeIdx = words.findIndex(
    (w: any) => ms >= w.start_ms && ms < w.end_ms,
  );
  const i = activeIdx === -1 ? lastBefore(words, ms) : activeIdx;
  if (i < 0) return null;

  // Show a window of words centred on the active one.
  const start = Math.max(0, i - 3);
  const window = words.slice(start, i + 4);
  const isLandscape = width > height;
  const fontSize = isLandscape ? Math.round(width * 0.02) : Math.round(width * 0.042);
  const accent = brand?.palette?.[1] ?? "#ffd24a";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";

  return (
    <div
      style={{
        position: "absolute",
        bottom: isLandscape ? "3%" : "12%",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: isLandscape ? "rgba(9, 13, 22, 0.85)" : "transparent",
          backdropFilter: isLandscape ? "blur(8px)" : "none",
          border: isLandscape ? "1px solid rgba(255, 255, 255, 0.1)" : "none",
          borderRadius: 999,
          padding: isLandscape ? "8px 28px" : "0",
          textAlign: "center",
          fontFamily: font,
          fontWeight: 700,
          fontSize,
          lineHeight: 1.2,
          color: "#fff",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.4em",
          justifyContent: "center",
          maxWidth: "80%",
          boxShadow: isLandscape ? "0 4px 20px rgba(0,0,0,0.6)" : "none",
        }}
      >
      {window.map((w: any, k: number) => {
        const isActive = start + k === i;
        return (
          <span
            key={k}
            style={{
              color: isActive ? accent : "#fff",
              opacity: isActive ? 1 : 0.6,
              transform: isActive ? "scale(1.06)" : "scale(1)",
              transition: "transform 80ms",
            }}
          >
            {w.word}
          </span>
        );
      })}
      </div>
    </div>
  );
};

function lastBefore(words: any[], ms: number) {
  let idx = -1;
  for (let k = 0; k < words.length; k++) {
    if (words[k].start_ms <= ms) idx = k;
    else break;
  }
  return idx;
}

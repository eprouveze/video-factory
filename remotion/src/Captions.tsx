import { useCurrentFrame, useVideoConfig } from "remotion";

// Word-level animated captions: highlight the spoken word, dim its neighbours.
// Mobile-first sizing, high-contrast stroke. Reads real STT word_timings.
export const Captions = ({ words, brand }: any) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const activeIdx = words.findIndex(
    (w: any) => ms >= w.start_ms && ms < w.end_ms,
  );
  const i = activeIdx === -1 ? lastBefore(words, ms) : activeIdx;
  if (i < 0) return null;

  // Show a window of words centred on the active one.
  const start = Math.max(0, i - 3);
  const window = words.slice(start, i + 4);
  const fontSize = Math.round(width * 0.045); // ~mobile 36-42pt equivalent
  const accent = brand?.palette?.[1] ?? "#ffd24a";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";

  return (
    <div
      style={{
        position: "absolute",
        bottom: "12%",
        width: "84%",
        left: "8%",
        textAlign: "center",
        fontFamily: font,
        fontWeight: 800,
        fontSize,
        lineHeight: 1.15,
        color: "#fff",
        textShadow: "0 2px 8px rgba(0,0,0,0.85)",
        WebkitTextStroke: "2px rgba(0,0,0,0.65)",
        display: "flex",
        flexWrap: "wrap",
        gap: "0.35em",
        justifyContent: "center",
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

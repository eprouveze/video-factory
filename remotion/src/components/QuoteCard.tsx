import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";

export const QuoteCard = ({
  quote,
  author,
  role,
  text,
  bg,
  accent: accentProp,
  brand,
}: any) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const accent = accentProp ?? brand?.palette?.[1] ?? "#60a5fa";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";
  const body = quote ?? text;

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const y = interpolate(enter, [0, 1], [30, 0]);
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "10%",
        fontFamily: font,
        ...(bg ? { backgroundColor: bg } : {}),
      }}
    >
      <div style={{ maxWidth: 1000, textAlign: "center", transform: `translateY(${y}px)`, opacity }}>
        <div style={{ fontSize: Math.round(width * 0.08), color: accent, lineHeight: 0.5, marginBottom: 20 }}>
          &ldquo;
        </div>
        <div
          style={{
            color: "#ffffff",
            fontWeight: 600,
            fontSize: Math.round(width * 0.04),
            lineHeight: 1.3,
            fontStyle: "italic",
            marginBottom: 32,
          }}
        >
          {body}
        </div>
        {(author || role) && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {author && (
              <div style={{ color: "#ffffff", fontWeight: 700, fontSize: Math.round(width * 0.024) }}>
                {author}
              </div>
            )}
            {role && (
              <div style={{ color: "#94a3b8", fontWeight: 500, fontSize: Math.round(width * 0.02) }}>
                {role}
              </div>
            )}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";

export const CTA = ({
  headline,
  url,
  subtext,
  text,
  bg,
  accent: accentProp,
  brand,
}: any) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const accent = accentProp ?? brand?.palette?.[1] ?? "#38bdf8";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";
  const title = headline ?? text ?? "Get Started";

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(enter, [0, 1], [0.9, 1]);
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "8%",
        fontFamily: font,
        textAlign: "center",
        ...(bg ? { backgroundColor: bg } : {}),
      }}
    >
      <div style={{ transform: `scale(${scale})`, opacity }}>
        <div
          style={{
            fontSize: Math.round(width * 0.05),
            fontWeight: 800,
            color: "#ffffff",
            marginBottom: 24,
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtext && (
          <div
            style={{
              fontSize: Math.round(width * 0.026),
              color: "#94a3b8",
              marginBottom: 36,
            }}
          >
            {subtext}
          </div>
        )}
        {url && (
          <div
            style={{
              display: "inline-block",
              padding: "16px 36px",
              borderRadius: 999,
              backgroundColor: accent,
              color: "#0f172a",
              fontWeight: 700,
              fontSize: Math.round(width * 0.028),
              boxShadow: `0 10px 30px ${accent}40`,
            }}
          >
            {url}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

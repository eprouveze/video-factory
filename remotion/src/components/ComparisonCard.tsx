import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";

export const ComparisonCard = ({
  headline,
  leftTitle = "Before",
  leftText,
  rightTitle = "After",
  rightText,
  bg,
  accent: accentProp,
  brand,
}: any) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const accent = accentProp ?? brand?.palette?.[1] ?? "#10b981";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";

  const enterLeft = spring({ frame, fps, config: { damping: 180 } });
  const enterRight = spring({ frame: frame - 10, fps, config: { damping: 180 } });

  const leftOpacity = interpolate(enterLeft, [0, 1], [0, 1]);
  const rightOpacity = interpolate(enterRight, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "6%",
        fontFamily: font,
        ...(bg ? { backgroundColor: bg } : {}),
      }}
    >
      <div style={{ maxWidth: 1200, width: "100%" }}>
        {headline && (
          <div
            style={{
              fontSize: Math.round(width * 0.04),
              fontWeight: 800,
              color: "#ffffff",
              marginBottom: 40,
              textAlign: "center",
            }}
          >
            {headline}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 16,
              padding: 32,
              opacity: leftOpacity,
            }}
          >
            <div style={{ color: "#f87171", fontWeight: 700, fontSize: Math.round(width * 0.025), marginBottom: 12 }}>
              {leftTitle}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: Math.round(width * 0.022), lineHeight: 1.4 }}>
              {leftText ?? "Manual steps, unreviewed outputs, and inconsistent quality."}
            </div>
          </div>
          <div
            style={{
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: 16,
              padding: 32,
              opacity: rightOpacity,
            }}
          >
            <div style={{ color: accent, fontWeight: 700, fontSize: Math.round(width * 0.025), marginBottom: 12 }}>
              {rightTitle}
            </div>
            <div style={{ color: "#ffffff", fontSize: Math.round(width * 0.022), lineHeight: 1.4 }}>
              {rightText ?? "Automated pipeline, human review gate, and deterministic rendering."}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

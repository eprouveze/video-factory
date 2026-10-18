import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";

export const FeatureSplit = ({
  headline,
  features = [],
  text,
  bg,
  accent: accentProp,
  brand,
}: any) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const accent = accentProp ?? brand?.palette?.[1] ?? "#38bdf8";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";
  const title = headline ?? text;

  const items = features.length > 0 ? features : ["Automated workflow", "Deterministic output", "Human review gate"];

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "8%",
        fontFamily: font,
        ...(bg ? { backgroundColor: bg } : {}),
      }}
    >
      <div style={{ maxWidth: 1100, width: "100%" }}>
        <div
          style={{
            fontSize: Math.round(width * 0.045),
            fontWeight: 800,
            color: "#ffffff",
            marginBottom: 40,
            textAlign: "center",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {items.map((item: string, idx: number) => {
            const itemEnter = spring({
              frame: frame - idx * 8,
              fps,
              config: { damping: 180 },
            });
            const x = interpolate(itemEnter, [0, 1], [-25, 0]);
            const opacity = interpolate(itemEnter, [0, 1], [0, 1]);

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 24px",
                  borderRadius: 12,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  transform: `translateX(${x}px)`,
                  opacity,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: accent,
                    flexShrink: 0,
                  }}
                />
                <div style={{ color: "#e2e8f0", fontSize: Math.round(width * 0.025), fontWeight: 600 }}>
                  {item}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

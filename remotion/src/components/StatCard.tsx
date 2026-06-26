import {
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";

// props: { value: "92%", label: "of drop-off is in the first 3 seconds" }
export const StatCard = ({ value, label, title, text, brand }: any) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const accent = brand?.palette?.[1] ?? "#ffd24a";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";

  const count = interpolate(frame, [0, fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  const shownValue = value ?? title ?? "";

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        padding: "8%",
        textAlign: "center",
        fontFamily: font,
      }}
    >
      <div
        style={{
          color: accent,
          fontWeight: 900,
          fontSize: Math.round(width * 0.16),
          opacity: count,
          transform: `scale(${0.9 + count * 0.1})`,
        }}
      >
        {shownValue}
      </div>
      <div
        style={{
          color: "#fff",
          fontWeight: 600,
          fontSize: Math.round(width * 0.034),
          marginTop: 12,
          maxWidth: "80%",
          opacity: interpolate(frame, [fps * 0.4, fps], [0, 1], {
            extrapolateRight: "clamp",
          }),
        }}
      >
        {label ?? text}
      </div>
    </AbsoluteFill>
  );
};

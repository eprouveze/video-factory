import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";

export const TitleCard = ({ title, text, brand }: any) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const accent = brand?.palette?.[1] ?? "#ffd24a";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const y = interpolate(enter, [0, 1], [40, 0]);
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "8%",
        textAlign: "center",
        fontFamily: font,
      }}
    >
      <div style={{ transform: `translateY(${y}px)`, opacity }}>
        {title ? (
          <div
            style={{
              color: accent,
              fontWeight: 800,
              fontSize: Math.round(width * 0.028),
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            {title}
          </div>
        ) : null}
        <div
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: Math.round(width * 0.05),
            lineHeight: 1.15,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

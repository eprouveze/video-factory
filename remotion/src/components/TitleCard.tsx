import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";

// Forgiving prop interface (agent-native): the Director may emit any of
//   eyebrow  — small accent label above the headline
//   headline — the main on-screen line (falls back to `text` = the scene narration)
//   subtext  — a smaller line beneath
//   bg       — background override   accent — accent color override
export const TitleCard = ({
  text,
  headline,
  subtext,
  eyebrow,
  bg,
  accent: accentProp,
  brand,
}: any) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const accent = accentProp ?? brand?.palette?.[1] ?? "#ffd24a";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";
  const body = headline ?? text;

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
        ...(bg ? { backgroundColor: bg } : {}),
      }}
    >
      <div style={{ transform: `translateY(${y}px)`, opacity }}>
        {eyebrow ? (
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
            {eyebrow}
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
          {body}
        </div>
        {subtext ? (
          <div
            style={{
              color: "#cfd3da",
              fontWeight: 500,
              fontSize: Math.round(width * 0.026),
              marginTop: 20,
              lineHeight: 1.3,
            }}
          >
            {subtext}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

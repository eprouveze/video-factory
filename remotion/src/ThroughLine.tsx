import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// The through-line device: ONE object the whole video carries, in the same corner of every
// frame, that changes state as the story moves (manifest.through_line). It is what makes
// separate scenes read as one piece.
//
// kind: counter (numbers roll between states) · progress (0-1 bar) · clock · tag (text flips)

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CORNERS: Record<string, any> = {
  tl: { top: "4%", left: "4%" },
  tr: { top: "4%", right: "4%", textAlign: "right" },
  bl: { bottom: "4%", left: "4%" },
  br: { bottom: "4%", right: "4%", textAlign: "right" },
};

export const ThroughLine = ({ device, starts, brand }: any) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const states: any[] = (device?.states ?? [])
    .map((s: any) => ({ ...s, at: starts[s.scene] }))
    .filter((s: any) => typeof s.at === "number")
    .sort((a: any, b: any) => a.at - b.at);
  if (!states.length) return null;

  let i = 0;
  while (i + 1 < states.length && frame >= states[i + 1].at) i++;
  const cur = states[i];
  const prev = states[i - 1];
  const since = (frame - cur.at) / fps;
  const k = prev ? interpolate(since, [0, 0.6], [0, 1], clamp) : 1;
  const eased = 1 - Math.pow(1 - k, 3);

  const accent = brand?.palette?.[1] ?? "#ffd24a";
  const u = Math.round(width > height ? width * 0.022 : width * 0.036);
  const kind = device.kind ?? "counter";
  const numeric =
    typeof cur.value === "number" && (!prev || typeof prev.value === "number");

  let value: any = cur.value;
  if ((kind === "counter" || kind === "progress") && numeric && prev)
    value = prev.value + (cur.value - prev.value) * eased;
  const shown =
    kind === "progress"
      ? null
      : numeric
        ? `${device.prefix ?? ""}${(+value).toFixed(device.decimals ?? 0)}${device.suffix ?? ""}`
        : String(cur.value);
  // text states flip in; numbers roll
  const flip =
    !numeric && prev ? interpolate(since, [0, 0.18], [0, 1], clamp) : 1;
  const step =
    states.length > 1 ? (prev ? i - 1 + eased : 0) / (states.length - 1) : 1;
  const fill =
    kind === "progress" && numeric
      ? Math.max(0, Math.min(1, +value))
      : Math.min(1, step);

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 40,
        fontFamily: MONO,
        color: "#f4f5f7",
        ...(CORNERS[device.position] ?? CORNERS.tr),
      }}
    >
      {device.label ? (
        <div
          style={{
            fontSize: u * 0.62,
            letterSpacing: u * 0.1,
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          {device.label}
        </div>
      ) : null}
      {shown !== null ? (
        <div
          style={{
            fontSize: u * 1.5,
            fontWeight: 700,
            color: accent,
            fontVariantNumeric: "tabular-nums",
            transform: `scaleY(${flip})`,
            lineHeight: 1.15,
          }}
        >
          {shown}
        </div>
      ) : null}
      <div
        style={{
          height: Math.max(2, u * 0.14),
          width: u * 9,
          background: "rgba(255,255,255,0.2)",
          marginTop: u * 0.3,
          marginLeft: (CORNERS[device.position] ?? CORNERS.tr).right
            ? "auto"
            : 0,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${100 * fill}%`,
            background: accent,
          }}
        />
      </div>
    </div>
  );
};

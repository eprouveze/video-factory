import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
// @ts-ignore — shared plain-JS helper (also used by the validators)
import { anchorMs } from "../../scripts/lib/anchors.mjs";

// Explaining graphics: code-drawn panels that enter ON the spoken word that names them
// (scene.graphics[].anchor) and stay to the end of the scene, so a shot builds instead of
// holding still. Text, numbers and interface are always drawn here, never by a generator.
//
// kinds: counter · bar · gauge · tally · stamp · tag · label · terminal · chat · strike ·
//        checklist · timeline

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// where a panel sits; the bottom band is left to the captions
const SLOTS: Record<string, any> = {
  tl: { top: "9%", left: "5%" },
  tr: { top: "9%", right: "5%" },
  ml: { top: "38%", left: "5%" },
  mr: { top: "38%", right: "5%" },
  bl: { bottom: "12%", left: "5%" },
  br: { bottom: "12%", right: "5%" },
  center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
};
const AUTO = ["bl", "br", "ml", "mr", "tl"];

type P = { g: any; t: number; u: number; accent: string; ink: string };
// t = seconds since the graphic entered · u = base unit (px) scaled from frame width

const Counter = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const k = interpolate(t, [0, p.roll_s ?? 0.7], [0, 1], clamp);
  const eased = 1 - Math.pow(1 - k, 3);
  const v = (p.from ?? 0) + ((p.to ?? 0) - (p.from ?? 0)) * eased;
  return (
    <div>
      <div
        style={{
          fontSize: u * 3.4,
          fontWeight: 800,
          color: accent,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {p.prefix ?? ""}
        {v.toFixed(p.decimals ?? 0)}
        {p.suffix ?? ""}
      </div>
      {p.label ? (
        <div style={{ fontSize: u * 0.95, color: ink, marginTop: u * 0.4 }}>
          {p.label}
        </div>
      ) : null}
    </div>
  );
};

const Bar = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const items: any[] = p.items ?? [];
  const max = p.max ?? Math.max(1, ...items.map((i) => +i.value || 0));
  return (
    <div style={{ width: u * 17 }}>
      {items.map((it, i) => {
        const k = interpolate(t, [i * 0.18, i * 0.18 + 0.5], [0, 1], clamp);
        return (
          <div key={i} style={{ marginBottom: u * 0.55 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: u * 0.85,
                color: ink,
              }}
            >
              <span>{it.label}</span>
              <span style={{ fontFamily: MONO, opacity: k }}>
                {it.value}
                {p.unit ?? ""}
              </span>
            </div>
            <div
              style={{
                height: u * 0.5,
                background: "rgba(255,255,255,0.12)",
                marginTop: u * 0.2,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(100 * k * (+it.value || 0)) / max}%`,
                  background: it.accent === false ? ink : accent,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Gauge = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const target = Math.max(0, Math.min(1, (+p.value || 0) / (p.max ?? 1)));
  const k =
    target * (1 - Math.pow(1 - interpolate(t, [0, 0.8], [0, 1], clamp), 3));
  const r = u * 3.2;
  const len = Math.PI * r;
  return (
    <div style={{ textAlign: "center" }}>
      <svg
        width={r * 2 + u}
        height={r + u}
        viewBox={`${-r - u / 2} ${-r - u / 2} ${r * 2 + u} ${r + u}`}
      >
        <path
          d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={u * 0.5}
        />
        <path
          d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
          fill="none"
          stroke={accent}
          strokeWidth={u * 0.5}
          strokeDasharray={`${len * k} ${len}`}
        />
      </svg>
      <div
        style={{
          fontSize: u * 1.9,
          fontWeight: 800,
          color: ink,
          marginTop: -u * 1.6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {p.display ?? `${Math.round(k * 100)}%`}
      </div>
      {p.label ? (
        <div
          style={{
            fontSize: u * 0.85,
            color: ink,
            opacity: 0.8,
            marginTop: u * 0.3,
          }}
        >
          {p.label}
        </div>
      ) : null}
    </div>
  );
};

const Tally = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const n = Math.min(60, p.count ?? 5);
  const lit = p.lit ?? n;
  return (
    <div style={{ maxWidth: u * 15 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: u * 0.3 }}>
        {Array.from({ length: n }, (_, i) => {
          const k = interpolate(t, [i * 0.05, i * 0.05 + 0.12], [0, 1], clamp);
          return (
            <div
              key={i}
              style={{
                width: u * 0.9,
                height: u * 0.9,
                opacity: 0.25 + 0.75 * k,
                background: i < lit ? accent : "rgba(255,255,255,0.35)",
              }}
            />
          );
        })}
      </div>
      {p.label ? (
        <div style={{ fontSize: u * 0.9, color: ink, marginTop: u * 0.5 }}>
          {p.label}
        </div>
      ) : null}
    </div>
  );
};

const Stamp = ({ g, t, u, accent }: P) => {
  const p = g.props ?? {};
  const k = interpolate(t, [0, 0.12, 0.22], [2.2, 0.94, 1], clamp);
  return (
    <div
      style={{
        transform: `rotate(${p.rotate ?? -7}deg) scale(${k})`,
        border: `${u * 0.22}px solid ${accent}`,
        color: accent,
        padding: `${u * 0.3}px ${u * 0.9}px`,
        fontSize: u * 2.2,
        fontWeight: 900,
        letterSpacing: u * 0.12,
        textTransform: "uppercase",
        opacity: interpolate(t, [0, 0.06], [0, 1], clamp),
      }}
    >
      {p.text}
    </div>
  );
};

const Tag = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const w = interpolate(t, [0, 0.25], [0, 1], clamp);
  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      <div
        style={{
          width: u * 0.22,
          background: accent,
          transform: `scaleY(${w})`,
          transformOrigin: "top",
        }}
      />
      <div
        style={{
          paddingLeft: u * 0.6,
          opacity: interpolate(t, [0.1, 0.3], [0, 1], clamp),
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: u * 0.7,
            color: accent,
            letterSpacing: u * 0.08,
            textTransform: "uppercase",
          }}
        >
          {p.class ?? "detected"}
        </div>
        <div
          style={{
            fontSize: u * 1.5,
            fontWeight: 800,
            color: ink,
            lineHeight: 1.1,
          }}
        >
          {p.text}
        </div>
        {p.sub ? (
          <div
            style={{
              fontFamily: MONO,
              fontSize: u * 0.7,
              color: ink,
              opacity: 0.7,
              marginTop: u * 0.2,
            }}
          >
            {p.sub}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const Label = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  return (
    <div
      style={{
        maxWidth: u * 17,
        opacity: interpolate(t, [0, 0.25], [0, 1], clamp),
        transform: `translateY(${interpolate(t, [0, 0.25], [u * 0.6, 0], clamp)}px)`,
      }}
    >
      <div
        style={{
          fontSize: u * 1.35,
          fontWeight: 700,
          color: ink,
          lineHeight: 1.2,
        }}
      >
        {p.text}
      </div>
      {p.sub ? (
        <div
          style={{
            fontSize: u * 0.9,
            color: ink,
            opacity: 0.8,
            marginTop: u * 0.3,
          }}
        >
          {p.sub}
        </div>
      ) : null}
      {p.source ? (
        <div
          style={{
            fontFamily: MONO,
            fontSize: u * 0.62,
            color: accent,
            marginTop: u * 0.5,
            letterSpacing: u * 0.04,
          }}
        >
          SOURCE · {p.source}
        </div>
      ) : null}
    </div>
  );
};

const Terminal = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const lines: string[] = p.lines ?? [];
  let budget = Math.floor(t * (p.cps ?? 32));
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: u * 0.85,
        color: ink,
        width: u * 19,
        lineHeight: 1.5,
      }}
    >
      {lines.map((ln, i) => {
        const shown = Math.max(0, Math.min(ln.length, budget));
        budget -= ln.length + 6;
        if (shown <= 0 && i > 0) return null;
        return (
          <div key={i}>
            <span style={{ color: accent }}>{p.prompt ?? ">"} </span>
            {ln.slice(0, shown)}
            {shown < ln.length ? (
              <span style={{ background: ink }}>&nbsp;</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const Chat = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const msgs: any[] = p.messages ?? [];
  return (
    <div
      style={{
        width: u * 17,
        display: "flex",
        flexDirection: "column",
        gap: u * 0.4,
      }}
    >
      {msgs.map((m, i) => {
        const k = interpolate(t, [i * 0.55, i * 0.55 + 0.18], [0, 1], clamp);
        const me = m.from === "me";
        return (
          <div
            key={i}
            style={{
              alignSelf: me ? "flex-end" : "flex-start",
              maxWidth: "82%",
              background: me ? accent : "rgba(255,255,255,0.14)",
              color: me ? "#0b0b0f" : ink,
              padding: `${u * 0.4}px ${u * 0.7}px`,
              borderRadius: u * 0.7,
              fontSize: u * 0.92,
              opacity: k,
              transform: `scale(${0.85 + 0.15 * k})`,
              transformOrigin: me ? "bottom right" : "bottom left",
            }}
          >
            {m.text}
          </div>
        );
      })}
    </div>
  );
};

const Strike = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const k = interpolate(t, [0.15, 0.45], [0, 1], clamp);
  return (
    <div style={{ fontSize: u * 1.7, fontWeight: 800 }}>
      <span style={{ position: "relative", color: ink, opacity: 1 - 0.5 * k }}>
        {p.text}
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "52%",
            height: u * 0.16,
            width: `${100 * k}%`,
            background: accent,
          }}
        />
      </span>
      {p.replace ? (
        <div
          style={{
            color: accent,
            marginTop: u * 0.3,
            opacity: interpolate(t, [0.45, 0.65], [0, 1], clamp),
          }}
        >
          {p.replace}
        </div>
      ) : null}
    </div>
  );
};

const Checklist = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const items: any[] = p.items ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: u * 0.45 }}>
      {items.map((raw, i) => {
        const it = typeof raw === "string" ? { text: raw } : raw;
        const k = interpolate(t, [i * 0.3, i * 0.3 + 0.2], [0, 1], clamp);
        const done = it.done !== false;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: u * 0.6,
              opacity: 0.3 + 0.7 * k,
            }}
          >
            <div
              style={{
                width: u * 1.05,
                height: u * 1.05,
                border: `${u * 0.12}px solid ${done ? accent : ink}`,
                background: done && k > 0.9 ? accent : "transparent",
                color: "#0b0b0f",
                fontSize: u * 0.8,
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {done && k > 0.9 ? "✓" : ""}
            </div>
            <div style={{ fontSize: u * 1.05, color: ink, fontWeight: 600 }}>
              {it.text}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Timeline = ({ g, t, u, accent, ink }: P) => {
  const p = g.props ?? {};
  const pts: any[] = p.points ?? [];
  const w = u * 19;
  const k = interpolate(t, [0, 0.3 + pts.length * 0.2], [0, 1], clamp);
  return (
    <div style={{ width: w }}>
      <div
        style={{
          position: "relative",
          height: u * 0.14,
          background: "rgba(255,255,255,0.18)",
          margin: `${u * 0.6}px 0`,
        }}
      >
        <div
          style={{ height: "100%", width: `${100 * k}%`, background: accent }}
        />
        {pts.map((_, i) => {
          const x = pts.length > 1 ? i / (pts.length - 1) : 0;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${100 * x}%`,
                top: "50%",
                width: u * 0.6,
                height: u * 0.6,
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                background: k >= x ? accent : "#555",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {pts.map((pt, i) => {
          const x = pts.length > 1 ? i / (pts.length - 1) : 0;
          return (
            <div
              key={i}
              style={{
                opacity: k >= x ? 1 : 0.25,
                textAlign:
                  i === 0 ? "left" : i === pts.length - 1 ? "right" : "center",
              }}
            >
              <div
                style={{ fontFamily: MONO, fontSize: u * 0.7, color: accent }}
              >
                {pt.label}
              </div>
              <div style={{ fontSize: u * 0.85, color: ink, fontWeight: 600 }}>
                {pt.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const KINDS: Record<string, (p: P) => any> = {
  counter: Counter,
  bar: Bar,
  gauge: Gauge,
  tally: Tally,
  stamp: Stamp,
  tag: Tag,
  label: Label,
  terminal: Terminal,
  chat: Chat,
  strike: Strike,
  checklist: Checklist,
  timeline: Timeline,
};
export const graphicKinds = Object.keys(KINDS);

export const GraphicsLayer = ({ scene, brand }: any) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const list: any[] = scene.graphics ?? [];
  if (!list.length) return null;
  const accent = brand?.palette?.[1] ?? "#ffd24a";
  const ink = "#f4f5f7";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";
  const u = Math.round(width > height ? width * 0.022 : width * 0.036);
  const onMedia =
    scene.visual?.source === "image" || scene.visual?.source === "clip";

  // portrait frames are too narrow for side-by-side panels: stack them in the lower half
  const portrait = height > width;

  const panels = (
    <>
      {list.map((g, i) => {
        const K = KINDS[g.kind];
        if (!K) return null;
        const at = Math.round((anchorMs(scene, g) / 1000) * fps);
        if (frame < at) return null;
        if (g.hold_ms && frame > at + Math.round((g.hold_ms / 1000) * fps))
          return null;
        const local = frame - at;
        const enter = spring({ frame: local, fps, config: { damping: 200 } });
        const slot = SLOTS[g.slot] ?? SLOTS[AUTO[i % AUTO.length]];
        const bare = g.kind === "stamp" || g.panel === false;
        return (
          <div
            key={i}
            style={{
              zIndex: 20,
              fontFamily: font,
              ...(portrait && g.slot !== "center"
                ? { alignSelf: i % 2 ? "flex-end" : "flex-start", maxWidth: "100%" }
                : { position: "absolute", ...slot }),
            }}
          >
            <div
              style={{
                opacity: enter,
                transform: `translateY(${interpolate(enter, [0, 1], [u * 0.8, 0])}px)`,
                ...(bare
                  ? {}
                  : {
                      background: onMedia
                        ? "rgba(8,10,16,0.78)"
                        : "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderTop: `2px solid ${accent}`,
                      padding: `${u * 0.9}px ${u * 1.1}px`,
                    }),
              }}
            >
              {g.title ? (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: u * 0.62,
                    color: ink,
                    opacity: 0.65,
                    letterSpacing: u * 0.08,
                    textTransform: "uppercase",
                    marginBottom: u * 0.5,
                  }}
                >
                  {g.title}
                </div>
              ) : null}
              <K g={g} t={local / fps} u={u} accent={accent} ink={ink} />
            </div>
          </div>
        );
      })}
    </>
  );
  if (!portrait) return panels;
  return (
    <div
      style={{
        position: "absolute",
        left: "6%",
        right: "6%",
        top: "40%",
        bottom: "22%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: u * 0.8,
      }}
    >
      {panels}
    </div>
  );
};

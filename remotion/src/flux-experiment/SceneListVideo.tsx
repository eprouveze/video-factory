import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";

const { fontFamily } = loadFont();

// ---------- Types (subset of FluxDiagram scene-list schema) ----------

type Theme = {
  accent: string;
  bg: string;
  card: string;
  chart: string[];
  surface: string;
  text: string;
  textMuted: string;
};

type Callout = {
  id: string;
  targetId: string;
  content: { primary: string; secondary?: string; type: string };
};

type Scene = {
  id: string;
  duration: number;
  template: string;
  transitionIn?: string;
  props: Record<string, any>;
  callouts?: Callout[];
  connectors?: any[];
};

export type SceneList = {
  fontFamily?: string;
  fps: number;
  scenes: Scene[];
  theme: Theme;
};

// ---------- Shared helpers ----------

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const clamp01 = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

const Header: React.FC<{
  title: string;
  subtitle?: string;
  theme: Theme;
  delay?: number;
}> = ({ title, subtitle, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const p = clamp01(frame, delay, delay + 30);
  return (
    <div
      style={{
        textAlign: "center",
        paddingTop: 70,
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px)`,
      }}
    >
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          color: theme.text,
          letterSpacing: -1,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 30, color: theme.textMuted, marginTop: 14 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
};

const CalloutCard: React.FC<{
  callout: Callout;
  theme: Theme;
  appearAt: number;
  style?: React.CSSProperties;
}> = ({ callout, theme, appearAt, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - appearAt,
    fps,
    config: { damping: 16, mass: 0.7 },
    durationInFrames: 30,
  });
  return (
    <div
      style={{
        position: "absolute",
        background: theme.card,
        border: `2px solid ${theme.accent}`,
        borderRadius: 14,
        padding: "18px 24px",
        maxWidth: 420,
        boxShadow: `0 0 40px ${theme.accent}33`,
        opacity: s,
        transform: `translateY(${(1 - s) * 20}px) scale(${0.9 + s * 0.1})`,
        ...style,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color: theme.accent }}>
        {callout.content.primary}
      </div>
      {callout.content.secondary ? (
        <div style={{ fontSize: 21, color: theme.textMuted, marginTop: 6 }}>
          {callout.content.secondary}
        </div>
      ) : null}
    </div>
  );
};

// ---------- Template: FlowchartRenderer ----------

const FlowchartRenderer: React.FC<{ scene: Scene; theme: Theme }> = ({
  scene,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nodes: { id: string; label: string }[] = scene.props.nodes ?? [];
  const edges: { from: string; to: string }[] = scene.props.edges ?? [];

  const NODE_W = 320;
  const NODE_H = 150;
  const GAP = 180;
  const totalW = nodes.length * NODE_W + (nodes.length - 1) * GAP;
  const startX = (1920 - totalW) / 2;
  const nodeY = 470;

  const nodeX = (id: string) => {
    const i = nodes.findIndex((n) => n.id === id);
    return startX + i * (NODE_W + GAP);
  };

  const callout = (scene.callouts ?? [])[0];
  const calloutTargetX = callout ? nodeX(callout.targetId) : 0;

  return (
    <AbsoluteFill style={{ background: "transparent" }}>
      <Header
        title={scene.props.header?.title}
        subtitle={scene.props.header?.subtitle}
        theme={theme}
        delay={5}
      />
      {/* connectors */}
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
      >
        {edges.map((e, i) => {
          const draw = clamp01(frame, 55 + i * 20, 85 + i * 20);
          const x0 = nodeX(e.from) + NODE_W;
          const x1 = nodeX(e.to);
          const y = nodeY + NODE_H / 2;
          const xTip = x0 + 14 + (x1 - x0 - 34) * draw;
          return (
            <g key={i} opacity={draw > 0 ? 1 : 0}>
              <line
                x1={x0 + 14}
                y1={y}
                x2={xTip}
                y2={y}
                stroke={theme.accent}
                strokeWidth={4}
              />
              <path
                d={`M ${xTip} ${y - 11} L ${xTip + 20} ${y} L ${xTip} ${y + 11} Z`}
                fill={theme.accent}
                opacity={draw}
              />
            </g>
          );
        })}
      </svg>
      {/* nodes */}
      {nodes.map((n, i) => {
        const s = spring({
          frame: frame - (30 + i * 22),
          fps,
          config: { damping: 13, mass: 0.7 },
          durationInFrames: 34,
        });
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: nodeX(n.id),
              top: nodeY,
              width: NODE_W,
              height: NODE_H,
              borderRadius: 18,
              background: theme.surface,
              border: `2px solid ${theme.accent}66`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 42,
              fontWeight: 700,
              color: theme.text,
              opacity: s,
              transform: `scale(${0.7 + s * 0.3})`,
              boxShadow: `0 10px 40px rgba(0,0,0,0.5)`,
            }}
          >
            {n.label}
          </div>
        );
      })}
      {callout ? (
        <CalloutCard
          callout={callout}
          theme={theme}
          appearAt={105}
          style={{
            left: Math.min(calloutTargetX, 1920 - 470),
            top: nodeY + NODE_H + 60,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- Template: BeforeAfterSplit ----------

const BeforeAfterSplit: React.FC<{ scene: Scene; theme: Theme }> = ({
  scene,
  theme,
}) => {
  const frame = useCurrentFrame();
  const p = scene.props;
  const dividerColor = p.divider?.color ?? theme.accent;
  const dividerW = p.divider?.width ?? 4;
  const dividerDraw = clamp01(frame, 30, 60);

  const Side: React.FC<{
    side: "left" | "right";
    data: any;
    accent: string;
  }> = ({ side, data, accent }) => {
    const enter = clamp01(
      frame,
      side === "left" ? 40 : 55,
      side === "left" ? 75 : 90,
    );
    const items: { label: string; value: string }[] = data.content?.items ?? [];
    return (
      <div
        style={{
          position: "absolute",
          top: 300,
          [side]: 160,
          width: 640,
          opacity: enter,
          transform: `translateX(${(1 - enter) * (side === "left" ? -80 : 80)}px)`,
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: side === "left" ? theme.textMuted : accent,
            marginBottom: 40,
            textAlign: "center",
          }}
        >
          {data.label}
        </div>
        {items.map((it, i) => {
          const ip = clamp01(frame, 70 + i * 15, 100 + i * 15);
          return (
            <div
              key={i}
              style={{
                background: theme.card,
                borderRadius: 16,
                padding: "28px 36px",
                marginBottom: 24,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                opacity: ip,
                transform: `translateY(${(1 - ip) * 18}px)`,
                border:
                  side === "right"
                    ? `1.5px solid ${accent}55`
                    : "1.5px solid transparent",
              }}
            >
              <span style={{ fontSize: 28, color: theme.textMuted }}>
                {it.label}
              </span>
              <span
                style={{
                  fontSize: 44,
                  fontWeight: 700,
                  color: side === "left" ? theme.text : accent,
                }}
              >
                {it.value}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <AbsoluteFill>
      <Header
        title={p.header?.title}
        subtitle={p.header?.subtitle}
        theme={theme}
        delay={5}
      />
      {/* divider */}
      <div
        style={{
          position: "absolute",
          left: 960 - dividerW / 2,
          top: 280 + (1 - dividerDraw) * 0,
          width: dividerW,
          height: 620 * dividerDraw,
          background: dividerColor,
          boxShadow: `0 0 30px ${dividerColor}88`,
          borderRadius: dividerW,
        }}
      />
      <Side side="left" data={p.left} accent={dividerColor} />
      <Side side="right" data={p.right} accent={dividerColor} />
    </AbsoluteFill>
  );
};

// ---------- Template: DashboardGrid ----------

const DashboardGrid: React.FC<{ scene: Scene; theme: Theme }> = ({
  scene,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = scene.props;
  const kpis: any[] = p.kpis ?? [];
  const chart = p.chart;
  const callout = (scene.callouts ?? [])[0];

  const CARD_W = 500;
  const GAP = 60;
  const startX = (1920 - (kpis.length * CARD_W + (kpis.length - 1) * GAP)) / 2;

  const series = chart?.data?.series?.[0]?.values ?? [];
  const xLabels: string[] = chart?.data?.xLabels ?? [];
  const maxV = Math.max(...series, 1);

  return (
    <AbsoluteFill>
      <Header
        title={p.header?.title}
        subtitle={p.header?.subtitle}
        theme={theme}
        delay={5}
      />
      {/* KPI cards */}
      {kpis.map((k, i) => {
        const s = spring({
          frame: frame - (30 + i * 14),
          fps,
          config: { damping: 15, mass: 0.7 },
          durationInFrames: 32,
        });
        const isTarget = callout?.targetId === k.id;
        return (
          <div
            key={k.id}
            style={{
              position: "absolute",
              left: startX + i * (CARD_W + GAP),
              top: 265,
              width: CARD_W,
              height: 220,
              background: theme.card,
              borderRadius: 20,
              border: isTarget
                ? `2px solid ${theme.accent}`
                : "2px solid transparent",
              padding: "34px 40px",
              boxSizing: "border-box",
              opacity: s,
              transform: `translateY(${(1 - s) * 34}px)`,
            }}
          >
            <div style={{ fontSize: 60, fontWeight: 700, color: theme.text }}>
              {k.value}
            </div>
            <div style={{ fontSize: 26, color: theme.textMuted, marginTop: 8 }}>
              {k.label}
            </div>
            {k.trend ? (
              <div
                style={{
                  fontSize: 22,
                  marginTop: 10,
                  color: k.trend.direction === "up" ? "#22c55e" : theme.accent,
                  fontWeight: 600,
                }}
              >
                {k.trend.direction === "up" ? "▲" : "▼"} {k.trend.value}
              </div>
            ) : null}
          </div>
        );
      })}
      {/* Bar chart */}
      {series.length ? (
        <div
          style={{
            position: "absolute",
            left: startX,
            top: 540,
            width: 1920 - 2 * startX,
            height: 330,
            background: theme.surface,
            borderRadius: 20,
            padding: "36px 60px 30px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 90,
              height: 200,
              justifyContent: "center",
            }}
          >
            {series.map((v: number, i: number) => {
              const grow = clamp01(frame, 75 + i * 12, 120 + i * 12);
              const h = (v / maxV) * 190 * grow;
              return (
                <div key={i} style={{ textAlign: "center", width: 150 }}>
                  <div
                    style={{
                      fontSize: 24,
                      color: theme.text,
                      fontWeight: 600,
                      opacity: grow,
                      marginBottom: 8,
                    }}
                  >
                    {v.toLocaleString()}
                  </div>
                  <div
                    style={{
                      height: h,
                      background: `linear-gradient(180deg, ${theme.chart[0]}, ${
                        theme.chart[1] ?? theme.chart[0]
                      })`,
                      borderRadius: "8px 8px 0 0",
                      width: "100%",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              gap: 90,
              justifyContent: "center",
              borderTop: `1px solid ${theme.textMuted}44`,
              paddingTop: 12,
              marginTop: 4,
            }}
          >
            {xLabels.map((l, i) => (
              <div
                key={i}
                style={{
                  width: 150,
                  textAlign: "center",
                  fontSize: 24,
                  color: theme.textMuted,
                }}
              >
                {l}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {callout ? (
        <CalloutCard
          callout={callout}
          theme={theme}
          appearAt={140}
          style={{ left: startX + 30, top: 130, maxWidth: 460 }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- Template: TimelineMilestones ----------

const TimelineMilestones: React.FC<{ scene: Scene; theme: Theme }> = ({
  scene,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = scene.props;
  const milestones: { id: string; date: string; title: string }[] =
    p.milestones ?? [];

  const axisY = 560;
  const X0 = 260;
  const X1 = 1660;
  const axisDraw = clamp01(frame, 25, 60);
  const step = milestones.length > 1 ? (X1 - X0) / (milestones.length - 1) : 0;

  return (
    <AbsoluteFill>
      <Header
        title={p.header?.title}
        subtitle={p.header?.subtitle}
        theme={theme}
        delay={5}
      />
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
      >
        {p.showAxisLine ? (
          <line
            x1={X0}
            y1={axisY}
            x2={X0 + (X1 - X0) * axisDraw}
            y2={axisY}
            stroke={`${theme.textMuted}88`}
            strokeWidth={3}
          />
        ) : null}
        {/* dashed connectors between milestone dots */}
        {milestones.slice(0, -1).map((_, i) => {
          const draw = clamp01(frame, 60 + i * 25, 95 + i * 25);
          const x0 = X0 + i * step + 16;
          const x1 = X0 + (i + 1) * step - 16;
          return (
            <line
              key={i}
              x1={x0}
              y1={axisY}
              x2={x0 + (x1 - x0) * draw}
              y2={axisY}
              stroke={theme.accent}
              strokeWidth={4}
              strokeDasharray="12 10"
              opacity={draw > 0 ? 1 : 0}
            />
          );
        })}
        {milestones.map((m, i) => {
          const s = spring({
            frame: frame - (45 + i * 25),
            fps,
            config: { damping: 11, mass: 0.5 },
            durationInFrames: 26,
          });
          return (
            <g key={m.id}>
              <circle
                cx={X0 + i * step}
                cy={axisY}
                r={16 * s}
                fill={theme.accent}
              />
              <circle
                cx={X0 + i * step}
                cy={axisY}
                r={26 * s}
                fill="none"
                stroke={`${theme.accent}55`}
                strokeWidth={3}
              />
            </g>
          );
        })}
      </svg>
      {milestones.map((m, i) => {
        const enter = clamp01(frame, 55 + i * 25, 90 + i * 25);
        const above = i % 2 === 0;
        const x = X0 + i * step;
        return (
          <div
            key={m.id}
            style={{
              position: "absolute",
              left: x - 210,
              top: above ? axisY - 220 : axisY + 60,
              width: 420,
              textAlign: "center",
              opacity: enter,
              transform: `translateY(${(1 - enter) * (above ? -16 : 16)}px)`,
            }}
          >
            <div
              style={{
                fontSize: 26,
                color: theme.accent,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {m.date}
            </div>
            <div
              style={{
                fontSize: 30,
                color: theme.text,
                fontWeight: 600,
                lineHeight: 1.3,
                background: theme.surface,
                borderRadius: 14,
                padding: "18px 22px",
              }}
            >
              {m.title}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- Transition wrapper ----------

const TEMPLATES: Record<string, React.FC<{ scene: Scene; theme: Theme }>> = {
  FlowchartRenderer,
  BeforeAfterSplit,
  DashboardGrid,
  TimelineMilestones,
};

const SceneShell: React.FC<{ scene: Scene; theme: Theme }> = ({
  scene,
  theme,
}) => {
  const frame = useCurrentFrame();
  const t = clamp01(frame, 0, 22);
  const Template = TEMPLATES[scene.template];

  let transform = "none";
  let clipPath: string | undefined;
  switch (scene.transitionIn) {
    case "slide-up":
      transform = `translateY(${(1 - t) * 90}px)`;
      break;
    case "slide-left":
      transform = `translateX(${(1 - t) * 120}px)`;
      break;
    case "wipe":
      clipPath = `inset(0 ${(1 - t) * 100}% 0 0)`;
      break;
  }

  return (
    <AbsoluteFill style={{ opacity: t, transform, clipPath }}>
      {Template ? (
        <Template scene={scene} theme={theme} />
      ) : (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            color: theme.text,
            fontSize: 40,
          }}
        >
          Unknown template: {scene.template}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ---------- Main ----------

export const SceneListVideo: React.FC<{ sceneList: SceneList }> = ({
  sceneList,
}) => {
  const theme = sceneList.theme;
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: theme.bg, fontFamily }}>
      {/* subtle ambient depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(1200px 800px at 50% 0%, ${theme.accent}0d, transparent 70%)`,
        }}
      />
      {sceneList.scenes.map((scene) => {
        const from = offset;
        offset += scene.duration;
        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={scene.duration}
          >
            <SceneShell scene={scene} theme={theme} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

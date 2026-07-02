import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// FluxDiagram explainer scenes — bespoke code-animated visuals.
// Brand: bg #0a0d16, indigo #6366f1 (light #818cf8), Inter.

const BG = "#0a0d16";
const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#818cf8";
const TEXT = "#e2e8f0";
const MUTED = "#64748b";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const useP = () => {
  const frame = useCurrentFrame();
  return (from: number, to: number) =>
    interpolate(frame, [from, to], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: easeOut,
    });
};

const Ambient: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        `radial-gradient(1000px 700px at 30% 15%, ${INDIGO}14, transparent 70%),` +
        `radial-gradient(900px 700px at 75% 90%, ${INDIGO}0d, transparent 70%)`,
    }}
  />
);

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{ backgroundColor: BG, fontFamily: "Inter, system-ui, sans-serif" }}
  >
    <Ambient />
    {children}
  </AbsoluteFill>
);

// ---------------------------------------------------------------- FluxHook
// "Static is a choice." (muted, frozen) → "Movement is a message." (kinetic)

export const FluxHook: React.FC<any> = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const p = useP();

  const line1 = p(6, 26);
  const line2 = spring({
    frame: frame - 40,
    fps,
    config: { damping: 16, mass: 0.8 },
    durationInFrames: 34,
  });
  const sweep = p(52, 92);

  return (
    <Frame>
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", gap: 26 }}
      >
        <div
          style={{
            fontSize: width * 0.024,
            letterSpacing: 6,
            color: INDIGO_LIGHT,
            fontWeight: 700,
            opacity: p(0, 14),
            marginBottom: 12,
          }}
        >
          FLUXDIAGRAM
        </div>
        <div
          style={{
            fontSize: width * 0.05,
            fontWeight: 700,
            color: MUTED,
            opacity: line1,
            transform: `translateY(${(1 - line1) * 20}px)`,
            letterSpacing: -1,
          }}
        >
          Static is a choice.
        </div>
        <div
          style={{
            fontSize: width * 0.056,
            fontWeight: 800,
            letterSpacing: -1.5,
            opacity: Math.min(1, line2 * 1.3),
            transform: `translateY(${(1 - line2) * 60}px)`,
            backgroundImage: `linear-gradient(100deg, #fff ${sweep * 100 - 40}%, ${INDIGO_LIGHT} ${sweep * 100 - 10}%, #fff ${sweep * 100 + 25}%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Movement is a message.
        </div>
      </AbsoluteFill>
    </Frame>
  );
};

// ------------------------------------------------------------- FluxProblem
// Split: lifeless static diagram vs the same diagram animating.

const MiniNode: React.FC<{
  x: number;
  y: number;
  w: number;
  label: string;
  color: string;
  border: string;
  scale?: number;
  glow?: number;
  fontSize?: number;
}> = ({
  x,
  y,
  w,
  label,
  color,
  border,
  scale = 1,
  glow = 0,
  fontSize = 24,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: 76,
      borderRadius: 14,
      background: color,
      border: `2px solid ${border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: TEXT,
      fontSize,
      fontWeight: 600,
      transform: `scale(${scale})`,
      boxShadow: glow > 0 ? `0 0 ${28 * glow}px ${INDIGO}66` : "none",
      opacity: scale > 0.05 ? 1 : 0,
    }}
  >
    {label}
  </div>
);

export const FluxProblem: React.FC<any> = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = useP();

  const leftIn = p(5, 25);
  const rightIn = p(40, 60);
  const labels = ["Plan", "Build", "Ship"];
  const colY = [0, 130, 260];

  const pulse = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 1.6);

  return (
    <Frame>
      {/* headline */}
      <div
        style={{
          position: "absolute",
          top: height * 0.09,
          width: "100%",
          textAlign: "center",
          fontSize: width * 0.032,
          fontWeight: 700,
          color: TEXT,
          opacity: p(0, 18),
          letterSpacing: -0.5,
        }}
      >
        Your slides explain systems that{" "}
        <span style={{ color: INDIGO_LIGHT }}>move</span>.
      </div>

      {/* left: static */}
      <div
        style={{
          position: "absolute",
          left: width * 0.14,
          top: height * 0.3,
          opacity: leftIn * 0.85,
        }}
      >
        <div
          style={{
            fontSize: 26,
            color: MUTED,
            fontWeight: 600,
            marginBottom: 28,
            textAlign: "center",
            width: 300,
          }}
        >
          Diagrams today
        </div>
        {labels.map((l, i) => (
          <MiniNode
            key={l}
            x={20}
            y={60 + colY[i]}
            w={260}
            label={l}
            color="#151a28"
            border="#2a3145"
          />
        ))}
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 148,
              top: 140 + colY[i],
              width: 2,
              height: 46,
              background: "#2a3145",
            }}
          />
        ))}
      </div>

      {/* divider */}
      <div
        style={{
          position: "absolute",
          left: width / 2 - 1,
          top: height * 0.28,
          width: 2,
          height: height * 0.52 * p(30, 55),
          background: `${INDIGO}55`,
        }}
      />

      {/* right: alive */}
      <div
        style={{
          position: "absolute",
          left: width * 0.6,
          top: height * 0.3,
          opacity: rightIn,
        }}
      >
        <div
          style={{
            fontSize: 26,
            color: INDIGO_LIGHT,
            fontWeight: 600,
            marginBottom: 28,
            textAlign: "center",
            width: 380,
            marginLeft: -40,
            whiteSpace: "nowrap",
          }}
        >
          Diagrams with FluxDiagram
        </div>
        {labels.map((l, i) => {
          const s = spring({
            frame: frame - (55 + i * 14),
            fps,
            config: { damping: 12, mass: 0.6 },
            durationInFrames: 28,
          });
          return (
            <MiniNode
              key={l}
              x={20}
              y={60 + colY[i]}
              w={260}
              label={l}
              color="#171d33"
              border={INDIGO}
              scale={s}
              glow={i === 2 ? pulse : 0.3}
            />
          );
        })}
        <svg
          width={300}
          height={400}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          {[0, 1].map((i) => {
            const draw = p(75 + i * 16, 100 + i * 16);
            return (
              <g key={i} opacity={draw > 0 ? 1 : 0}>
                <line
                  x1={148}
                  y1={140 + colY[i]}
                  x2={148}
                  y2={140 + colY[i] + 42 * draw}
                  stroke={INDIGO_LIGHT}
                  strokeWidth={3}
                />
                <path
                  d={`M 141 ${172 + colY[i]} L 148 ${184 + colY[i]} L 155 ${172 + colY[i]} Z`}
                  fill={INDIGO_LIGHT}
                  opacity={draw}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </Frame>
  );
};

// ---------------------------------------------------------- FluxHowItWorks
// Type the description → diagram assembles → export chips.

export const FluxHowItWorks: React.FC<any> = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = useP();

  const promptText = "Show our deploy pipeline with a validation loop";
  const typeP = p(12, 78);
  const chars = Math.round(promptText.length * typeP);
  const caretOn = Math.floor(frame / 15) % 2 === 0;

  const steps = ["Describe", "Generate", "Embed"];
  const activeStep = frame < 85 ? 0 : frame < 190 ? 1 : 2;

  const nodes = [
    { label: "Commit", x: 0 },
    { label: "Validate", x: 1 },
    { label: "Deploy", x: 2 },
  ];
  const NW = 250;
  const GAP = 130;
  const totalW = nodes.length * NW + (nodes.length - 1) * GAP;
  const x0 = (width - totalW) / 2;
  const nodeY = height * 0.52;

  const chipsIn = spring({
    frame: frame - 205,
    fps,
    config: { damping: 200 },
    durationInFrames: 24,
  });

  return (
    <Frame>
      {/* step rail */}
      <div
        style={{
          position: "absolute",
          top: height * 0.1,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 56,
          opacity: p(0, 14),
        }}
      >
        {steps.map((s, i) => (
          <div
            key={s}
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: i <= activeStep ? INDIGO : "#1a2138",
                color: i <= activeStep ? "#fff" : MUTED,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 22,
                transition: "background 0.2s",
              }}
            >
              {i + 1}
            </div>
            <span
              style={{
                fontSize: 27,
                fontWeight: 600,
                color: i <= activeStep ? TEXT : MUTED,
              }}
            >
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* prompt field */}
      <div
        style={{
          position: "absolute",
          top: height * 0.26,
          left: width / 2 - 560,
          width: 1120,
          borderRadius: 18,
          border: `2px solid ${frame < 85 ? INDIGO : "#232b45"}`,
          background: "#10152a",
          padding: "28px 36px",
          fontSize: 30,
          color: TEXT,
          opacity: p(4, 18),
        }}
      >
        <span style={{ color: MUTED, marginRight: 14 }}>Describe:</span>
        {promptText.slice(0, chars)}
        <span
          style={{
            opacity: caretOn && frame < 95 ? 1 : 0,
            color: INDIGO_LIGHT,
          }}
        >
          ▍
        </span>
      </div>

      {/* assembling diagram */}
      {nodes.map((n, i) => {
        const s = spring({
          frame: frame - (95 + i * 16),
          fps,
          config: { damping: 12, mass: 0.6 },
          durationInFrames: 30,
        });
        return (
          <MiniNode
            key={n.label}
            x={x0 + i * (NW + GAP)}
            y={nodeY}
            w={NW}
            label={n.label}
            color="#171d33"
            border={INDIGO}
            scale={s}
            glow={0.35}
            fontSize={28}
          />
        );
      })}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0 }}
      >
        {[0, 1].map((i) => {
          const draw = p(125 + i * 18, 150 + i * 18);
          const sx = x0 + NW + i * (NW + GAP);
          const ex = sx + GAP;
          const y = nodeY + 38;
          const xt = sx + 10 + (ex - sx - 26) * draw;
          return (
            <g key={i} opacity={draw > 0 ? 1 : 0}>
              <line
                x1={sx + 10}
                y1={y}
                x2={xt}
                y2={y}
                stroke={INDIGO_LIGHT}
                strokeWidth={3.5}
              />
              <path
                d={`M ${xt} ${y - 9} L ${xt + 16} ${y} L ${xt} ${y + 9} Z`}
                fill={INDIGO_LIGHT}
              />
            </g>
          );
        })}
        {/* validation loop-back */}
        {(() => {
          const draw = p(165, 200);
          const fromX = x0 + NW + GAP + NW / 2; // Validate center
          const toX = x0 + NW / 2; // Commit center
          const yTop = nodeY + 38;
          const d = `M ${fromX} ${yTop + 58} C ${fromX} ${yTop + 150}, ${toX} ${yTop + 150}, ${toX} ${yTop + 62}`;
          const LEN = 900;
          return (
            <g opacity={draw > 0 ? 1 : 0}>
              <path
                d={d}
                stroke={`${INDIGO_LIGHT}aa`}
                strokeWidth={3}
                strokeDasharray={`${LEN}`}
                strokeDashoffset={(1 - draw) * LEN}
                fill="none"
              />
              <path
                d={`M ${toX - 8} ${yTop + 74} L ${toX} ${yTop + 58} L ${toX + 8} ${yTop + 74} Z`}
                fill={INDIGO_LIGHT}
                opacity={draw >= 1 ? 1 : 0}
              />
            </g>
          );
        })()}
      </svg>

      {/* export chips */}
      <div
        style={{
          position: "absolute",
          bottom: height * 0.09,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 22,
          opacity: chipsIn,
          transform: `translateY(${(1 - chipsIn) * 26}px)`,
        }}
      >
        {["▶ Preview", "GIF", "MP4", "WebM"].map((c, i) => (
          <div
            key={c}
            style={{
              padding: "14px 30px",
              borderRadius: 999,
              background: i === 0 ? INDIGO : "#151b30",
              border: `1.5px solid ${i === 0 ? INDIGO : "#2a3350"}`,
              color: i === 0 ? "#fff" : TEXT,
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            {c}
          </div>
        ))}
      </div>
    </Frame>
  );
};

// ------------------------------------------------------------ FluxShowcase
// Three vignettes: timeline unfolds → bars grow → flow arrows.

export const FluxShowcase: React.FC<any> = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = useP();

  const CARD_W = width * 0.27;
  const CARD_H = height * 0.5;
  const gap = width * 0.03;
  const x0 = (width - 3 * CARD_W - 2 * gap) / 2;
  const y0 = height * 0.28;
  const titles = ["Flows", "Timelines", "Dashboards"];

  return (
    <Frame>
      <div
        style={{
          position: "absolute",
          top: height * 0.1,
          width: "100%",
          textAlign: "center",
          fontSize: width * 0.032,
          fontWeight: 700,
          color: TEXT,
          opacity: p(0, 16),
          letterSpacing: -0.5,
        }}
      >
        Every diagram, <span style={{ color: INDIGO_LIGHT }}>in motion</span>.
      </div>
      {titles.map((t, ci) => {
        const cardIn = spring({
          frame: frame - (14 + ci * 18),
          fps,
          config: { damping: 15, mass: 0.7 },
          durationInFrames: 30,
        });
        const cx = x0 + ci * (CARD_W + gap);
        const local = Math.max(0, frame - (30 + ci * 18));
        return (
          <div
            key={t}
            style={{
              position: "absolute",
              left: cx,
              top: y0,
              width: CARD_W,
              height: CARD_H,
              borderRadius: 22,
              background: "#10152a",
              border: "1.5px solid #232b45",
              opacity: cardIn,
              transform: `translateY(${(1 - cardIn) * 46}px)`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                textAlign: "center",
                marginTop: 26,
                fontSize: 27,
                fontWeight: 700,
                color: INDIGO_LIGHT,
              }}
            >
              {t}
            </div>
            <svg width={CARD_W} height={CARD_H - 90} style={{ marginTop: 16 }}>
              {ci === 0 &&
                (() => {
                  // flow: two nodes + drawn arrow + loop
                  const draw = Math.min(1, local / 40);
                  const n1y = 90;
                  const n2y = 250;
                  const cxm = CARD_W / 2;
                  return (
                    <g>
                      <rect
                        x={cxm - 90}
                        y={n1y}
                        width={180}
                        height={64}
                        rx={12}
                        fill="#171d33"
                        stroke={INDIGO}
                        strokeWidth={2}
                      />
                      <text
                        x={cxm}
                        y={n1y + 40}
                        textAnchor="middle"
                        fill={TEXT}
                        fontSize={22}
                        fontWeight={600}
                        fontFamily="Inter"
                      >
                        Request
                      </text>
                      <line
                        x1={cxm}
                        y1={n1y + 66}
                        x2={cxm}
                        y2={n1y + 66 + 116 * draw}
                        stroke={INDIGO_LIGHT}
                        strokeWidth={3}
                      />
                      {draw >= 0.99 && (
                        <path
                          d={`M ${cxm - 8} ${n2y - 14} L ${cxm} ${n2y} L ${cxm + 8} ${n2y - 14} Z`}
                          fill={INDIGO_LIGHT}
                        />
                      )}
                      <g opacity={Math.min(1, Math.max(0, (local - 45) / 20))}>
                        <rect
                          x={cxm - 90}
                          y={n2y}
                          width={180}
                          height={64}
                          rx={12}
                          fill="#171d33"
                          stroke={INDIGO}
                          strokeWidth={2}
                        />
                        <text
                          x={cxm}
                          y={n2y + 40}
                          textAnchor="middle"
                          fill={TEXT}
                          fontSize={22}
                          fontWeight={600}
                          fontFamily="Inter"
                        >
                          Response
                        </text>
                      </g>
                    </g>
                  );
                })()}
              {ci === 1 &&
                (() => {
                  // timeline: axis + 3 dots
                  const axis = Math.min(1, local / 35);
                  const lx = 50;
                  const rx = CARD_W - 50;
                  const ty = 190;
                  return (
                    <g>
                      <line
                        x1={lx}
                        y1={ty}
                        x2={lx + (rx - lx) * axis}
                        y2={ty}
                        stroke="#3a4362"
                        strokeWidth={3}
                      />
                      {[0, 1, 2].map((i) => {
                        const ds = Math.min(
                          1,
                          Math.max(0, (local - 20 - i * 14) / 16),
                        );
                        const dx = lx + ((rx - lx) / 2) * i;
                        return (
                          <g key={i}>
                            <circle
                              cx={dx}
                              cy={ty}
                              r={13 * ds}
                              fill={INDIGO_LIGHT}
                            />
                            <rect
                              x={dx - 44}
                              y={i % 2 === 0 ? ty - 88 : ty + 32}
                              width={88}
                              height={40}
                              rx={9}
                              fill="#171d33"
                              opacity={ds}
                            />
                            <text
                              x={dx}
                              y={(i % 2 === 0 ? ty - 88 : ty + 32) + 26}
                              textAnchor="middle"
                              fill={MUTED}
                              fontSize={18}
                              fontFamily="Inter"
                              opacity={ds}
                            >
                              {["Q1", "Q2", "Q3"][i]}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}
              {ci === 2 &&
                (() => {
                  // bars growing
                  const vals = [0.35, 0.6, 0.45, 0.9];
                  const bw = 52;
                  const bgap = 30;
                  const baseX =
                    (CARD_W - (vals.length * bw + (vals.length - 1) * bgap)) /
                    2;
                  const baseY = 300;
                  return (
                    <g>
                      {vals.map((v, i) => {
                        const g = Math.min(
                          1,
                          Math.max(0, (local - i * 10) / 30),
                        );
                        const h = v * 200 * g;
                        return (
                          <rect
                            key={i}
                            x={baseX + i * (bw + bgap)}
                            y={baseY - h}
                            width={bw}
                            height={h}
                            rx={8}
                            fill={i === 3 ? INDIGO_LIGHT : INDIGO}
                            opacity={0.55 + 0.45 * g}
                          />
                        );
                      })}
                      <line
                        x1={baseX - 14}
                        y1={baseY}
                        x2={baseX + vals.length * (bw + bgap)}
                        y2={baseY}
                        stroke="#3a4362"
                        strokeWidth={2.5}
                      />
                    </g>
                  );
                })()}
            </svg>
          </div>
        );
      })}
    </Frame>
  );
};

// ----------------------------------------------------------------- FluxCTA

export const FluxCTA: React.FC<any> = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = useP();

  const markIn = spring({
    frame: frame - 4,
    fps,
    config: { damping: 13, mass: 0.7 },
    durationInFrames: 30,
  });
  const pillIn = spring({
    frame: frame - 55,
    fps,
    config: { damping: 200 },
    durationInFrames: 26,
  });

  return (
    <Frame>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 30,
            transform: `scale(${markIn})`,
            opacity: markIn,
          }}
        >
          {/* Canonical brand asset (web/public/logo-512.png) — staged by the
              compositor via manifest visual.asset. Never invent brand marks. */}
          <Img
            src={staticFile("assets/logo.png")}
            style={{ width: 132, height: 132 }}
          />
          {/* Wordmark colors match web/src/components/marketing/nav.tsx:
              "Flux" flux-indigo solid, "Diagram" slate-100. */}
          <div
            style={{
              fontSize: width * 0.052,
              fontWeight: 700,
              letterSpacing: -2,
              color: "#f1f5f9",
            }}
          >
            <span style={{ color: INDIGO }}>Flux</span>
            Diagram
          </div>
        </div>

        <div
          style={{
            marginTop: 30,
            fontSize: width * 0.019,
            color: MUTED,
            fontWeight: 500,
            opacity: p(30, 50),
          }}
        >
          Static is a choice. Movement is a message.
        </div>

        <div
          style={{
            marginTop: 54,
            padding: "20px 56px",
            borderRadius: 999,
            background: `linear-gradient(100deg, ${INDIGO}, ${INDIGO_LIGHT})`,
            color: "#fff",
            fontSize: width * 0.024,
            fontWeight: 700,
            opacity: pillIn,
            transform: `translateY(${(1 - pillIn) * 28}px)`,
            boxShadow: `0 0 60px ${INDIGO}55`,
          }}
        >
          fluxdiagram.app
        </div>

        <div
          style={{
            marginTop: 46,
            display: "flex",
            gap: 30,
            fontSize: width * 0.015,
            color: MUTED,
            fontWeight: 600,
            opacity: p(75, 95),
          }}
        >
          <span>Embed in PowerPoint</span>
          <span style={{ color: "#2a3350" }}>·</span>
          <span>Google Slides</span>
          <span style={{ color: "#2a3350" }}>·</span>
          <span>Keynote</span>
        </div>
      </AbsoluteFill>
    </Frame>
  );
};

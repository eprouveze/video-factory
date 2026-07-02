import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

// ---- Design constants (recreating gemini-embedding-multimodal-flow.png) ----

const GOOGLE = {
  blue: "#4285F4",
  red: "#EA4335",
  yellow: "#FBBC04",
  green: "#34A853",
  purple: "#A142F4",
};

const LINE_BLUE = "#5B8DEF";

type Pill = { label: string; color: string; y: number };

const PILLS: Pill[] = [
  { label: "Text", color: GOOGLE.blue, y: 150 },
  { label: "Image", color: GOOGLE.green, y: 345 },
  { label: "Video", color: GOOGLE.red, y: 540 },
  { label: "Audio", color: GOOGLE.yellow, y: 735 },
  { label: "Documents", color: GOOGLE.purple, y: 930 },
];

const PILL_X = 80;
const PILL_W = 230;
const PILL_H = 78;

const HUB = { x: 600, y: 560 };
const BOX = { cx: 910, cy: 560, w: 300, h: 140 };
const PANEL = { x: 1290, y: 290, size: 560 };
const PANEL_C = { x: PANEL.x + PANEL.size / 2, y: PANEL.y + PANEL.size / 2 };

// Scatter dots inside the panel (relative to panel top-left, panel is 560px)
const DOTS: { x: number; y: number; r: number; c: string }[] = [
  { x: 95, y: 85, r: 8, c: GOOGLE.purple },
  { x: 175, y: 145, r: 13, c: GOOGLE.blue },
  { x: 195, y: 175, r: 10, c: GOOGLE.yellow },
  { x: 300, y: 95, r: 8, c: GOOGLE.red },
  { x: 470, y: 155, r: 8, c: GOOGLE.blue },
  { x: 80, y: 285, r: 9, c: GOOGLE.purple },
  { x: 390, y: 270, r: 12, c: GOOGLE.purple },
  { x: 405, y: 295, r: 10, c: GOOGLE.green },
  { x: 185, y: 390, r: 11, c: GOOGLE.blue },
  { x: 205, y: 405, r: 12, c: GOOGLE.red },
  { x: 225, y: 400, r: 9, c: GOOGLE.yellow },
  { x: 455, y: 390, r: 9, c: GOOGLE.yellow },
  { x: 345, y: 450, r: 7, c: GOOGLE.green },
];

// A reveal helper: 0..1 progress between two frames
const useReveal = () => {
  const frame = useCurrentFrame();
  return (from: number, to: number, easing?: (t: number) => number) =>
    interpolate(frame, [from, to], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing,
    });
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Icon glyphs (minimal, drawn in SVG so no emoji dependency)
const PillIcon: React.FC<{ color: string; kind: string }> = ({
  color,
  kind,
}) => {
  const glyph = (() => {
    switch (kind) {
      case "Text":
        return (
          <>
            <line x1="10" y1="12" x2="24" y2="12" />
            <line x1="10" y1="17" x2="24" y2="17" />
            <line x1="10" y1="22" x2="19" y2="22" />
          </>
        );
      case "Image":
        return (
          <>
            <rect x="9" y="10" width="16" height="14" rx="2" fill="none" />
            <circle cx="14" cy="15" r="1.8" fill="#fff" stroke="none" />
            <path d="M11 22 L16 17 L20 21 L23 18" fill="none" />
          </>
        );
      case "Video":
        return (
          <>
            <rect x="8" y="11" width="12" height="12" rx="2" fill="none" />
            <path d="M20 15 L26 12 L26 22 L20 19 Z" fill="#fff" stroke="none" />
          </>
        );
      case "Audio":
        return (
          <>
            <line x1="10" y1="14" x2="10" y2="20" />
            <line x1="14" y1="10" x2="14" y2="24" />
            <line x1="18" y1="13" x2="18" y2="21" />
            <line x1="22" y1="11" x2="22" y2="23" />
          </>
        );
      default: // Documents
        return (
          <>
            <path d="M11 9 H20 L24 13 V25 H11 Z" fill="none" />
            <line x1="14" y1="16" x2="21" y2="16" />
            <line x1="14" y1="20" x2="21" y2="20" />
          </>
        );
    }
  })();
  return (
    <svg width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r="16" fill={color} />
      <g
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="scale(1)"
      >
        {glyph}
      </g>
    </svg>
  );
};

export const GeminiFlow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = useReveal();

  const titleIn = reveal(0, 25, easeOut);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#020409",
        fontFamily,
        overflow: "hidden",
      }}
    >
      {/* Ambient glows */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(900px 700px at 12% 20%, rgba(30,64,175,0.22), transparent 70%)," +
            "radial-gradient(1000px 800px at 88% 75%, rgba(30,58,138,0.18), transparent 70%)," +
            "radial-gradient(700px 500px at 55% 100%, rgba(15,23,42,0.9), transparent 75%)",
        }}
      />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          left: 620,
          top: 120,
          fontSize: 66,
          fontWeight: 500,
          color: "#fff",
          letterSpacing: -0.5,
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 24}px)`,
        }}
      >
        Multimodal input
      </div>

      {/* Connector curves: pills -> hub, hub -> box, box -> panel */}
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0 }}
      >
        {PILLS.map((p, i) => {
          const draw = reveal(38 + i * 6, 85 + i * 6, easeOut);
          const x0 = PILL_X + PILL_W;
          const d = `M ${x0} ${p.y} C ${x0 + 170} ${p.y}, ${HUB.x - 170} ${
            HUB.y
          }, ${HUB.x} ${HUB.y}`;
          const LEN = 700; // over-estimate of path length for dash reveal
          return (
            <path
              key={p.label}
              d={d}
              stroke={LINE_BLUE}
              strokeWidth={2.5}
              fill="none"
              strokeDasharray={LEN}
              strokeDashoffset={(1 - draw) * LEN}
              opacity={draw > 0 ? 0.9 : 0}
            />
          );
        })}
        {/* hub -> embedding box */}
        {(() => {
          const draw = reveal(92, 112, easeOut);
          const x1 = BOX.cx - BOX.w / 2;
          const LEN = 220;
          return (
            <line
              x1={HUB.x}
              y1={HUB.y}
              x2={x1}
              y2={BOX.cy}
              stroke={LINE_BLUE}
              strokeWidth={2.5}
              strokeDasharray={LEN}
              strokeDashoffset={(1 - draw) * LEN}
              opacity={draw > 0 ? 0.9 : 0}
            />
          );
        })()}
        {/* box -> panel arrow */}
        {(() => {
          const draw = reveal(128, 150, easeOut);
          const x0 = BOX.cx + BOX.w / 2;
          const x1 = PANEL.x - 30;
          const xTip = x0 + (x1 - x0) * draw;
          return (
            <g opacity={draw > 0 ? 0.95 : 0}>
              <line
                x1={x0}
                y1={BOX.cy}
                x2={xTip}
                y2={BOX.cy}
                stroke={LINE_BLUE}
                strokeWidth={3}
              />
              <path
                d={`M ${xTip} ${BOX.cy - 9} L ${xTip + 18} ${BOX.cy} L ${xTip} ${
                  BOX.cy + 9
                } Z`}
                fill={LINE_BLUE}
              />
            </g>
          );
        })()}
      </svg>

      {/* Input pills */}
      {PILLS.map((p, i) => {
        const s = spring({
          frame: frame - (8 + i * 6),
          fps,
          config: { damping: 200 },
          durationInFrames: 24,
        });
        return (
          <div
            key={p.label}
            style={{
              position: "absolute",
              left: PILL_X,
              top: p.y - PILL_H / 2,
              width: PILL_W,
              height: PILL_H,
              borderRadius: 12,
              border: "1.5px solid rgba(91,141,239,0.65)",
              background: "rgba(7,12,24,0.85)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              paddingLeft: 16,
              boxSizing: "border-box",
              opacity: s,
              transform: `translateX(${(s - 1) * 60}px)`,
            }}
          >
            <PillIcon color={p.color} kind={p.label} />
            <span style={{ color: "#fff", fontSize: 27, fontWeight: 400 }}>
              {p.label}
            </span>
          </div>
        );
      })}

      {/* Hub icons (overlapping mini circles) */}
      {(() => {
        const s = spring({
          frame: frame - 84,
          fps,
          config: { damping: 12, mass: 0.6 },
          durationInFrames: 30,
        });
        return (
          <div
            style={{
              position: "absolute",
              left: HUB.x - 30,
              top: HUB.y - 42,
              transform: `scale(${s})`,
              opacity: s,
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: GOOGLE.blue,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              ≡
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: GOOGLE.green,
                border: "3px solid #020409",
                marginTop: -14,
                marginLeft: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22">
                <rect
                  x="3"
                  y="4"
                  width="16"
                  height="14"
                  rx="2"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2"
                />
                <path
                  d="M5 16 L10 11 L14 15 L17 12"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>
        );
      })()}

      {/* Embedding model box */}
      {(() => {
        const s = spring({
          frame: frame - 104,
          fps,
          config: { damping: 14, mass: 0.7 },
          durationInFrames: 32,
        });
        return (
          <div
            style={{
              position: "absolute",
              left: BOX.cx - BOX.w / 2,
              top: BOX.cy - BOX.h / 2,
              width: BOX.w,
              height: BOX.h,
              borderRadius: 16,
              background: "linear-gradient(135deg, #1a73e8 0%, #4fa8ff 100%)",
              boxShadow: "0 0 60px rgba(66,133,244,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 34,
              fontWeight: 500,
              textAlign: "center",
              lineHeight: 1.25,
              transform: `scale(${s})`,
              opacity: Math.min(1, s * 1.4),
            }}
          >
            Embedding
            <br />
            model
          </div>
        );
      })()}

      {/* Embedding space panel */}
      {(() => {
        const panelIn = reveal(140, 168, easeOut);
        const axes = reveal(155, 185, easeOut);
        return (
          <div
            style={{
              position: "absolute",
              left: PANEL.x,
              top: PANEL.y,
              width: PANEL.size,
              height: PANEL.size,
              borderRadius: 28,
              border: "2px solid rgba(91,141,239,0.85)",
              background: "rgba(4,8,18,0.6)",
              opacity: panelIn,
              transform: `scale(${0.94 + panelIn * 0.06})`,
            }}
          >
            <svg
              width={PANEL.size}
              height={PANEL.size}
              style={{ position: "absolute", inset: 0 }}
            >
              {/* 3D axes from center */}
              {(
                [
                  [0, -160],
                  [155, 105],
                  [-155, 105],
                ] as const
              ).map(([dx, dy], i) => {
                const cx = PANEL.size / 2;
                const cy = PANEL.size / 2 + 15;
                const ex = cx + dx * axes;
                const ey = cy + dy * axes;
                const ang = Math.atan2(dy, dx);
                const a = 10;
                return (
                  <g key={i} opacity={axes}>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={ex}
                      y2={ey}
                      stroke={LINE_BLUE}
                      strokeWidth={2.5}
                    />
                    <path
                      d={`M ${ex + Math.cos(ang) * a * 1.6} ${
                        ey + Math.sin(ang) * a * 1.6
                      } L ${ex + Math.cos(ang + 2.5) * a} ${
                        ey + Math.sin(ang + 2.5) * a
                      } L ${ex + Math.cos(ang - 2.5) * a} ${
                        ey + Math.sin(ang - 2.5) * a
                      } Z`}
                      fill={LINE_BLUE}
                    />
                  </g>
                );
              })}
              {/* scatter dots */}
              {DOTS.map((d, i) => {
                const s = spring({
                  frame: frame - (170 + i * 3),
                  fps,
                  config: { damping: 11, mass: 0.5 },
                  durationInFrames: 22,
                });
                return (
                  <circle
                    key={i}
                    cx={d.x}
                    cy={d.y}
                    r={d.r * s}
                    fill={d.c}
                    opacity={Math.min(1, s * 1.3)}
                  />
                );
              })}
            </svg>
          </div>
        );
      })()}

      {/* Unified embedding space pill */}
      {(() => {
        const s = spring({
          frame: frame - 215,
          fps,
          config: { damping: 200 },
          durationInFrames: 26,
        });
        return (
          <div
            style={{
              position: "absolute",
              left: PANEL_C.x - 220,
              top: PANEL.y + PANEL.size + 55,
              width: 440,
              height: 76,
              borderRadius: 38,
              background: "linear-gradient(90deg, #1a73e8 0%, #35a0ff 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 29,
              fontWeight: 500,
              opacity: s,
              transform: `translateY(${(1 - s) * 30}px)`,
            }}
          >
            Unified embedding space
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};

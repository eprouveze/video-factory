import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// SlideVerso Launch & Explainer Video Scenes
// Brand Palette: Dark slate navy #090d16, Indigo/Violet #8b5cf6, Emerald #10b981, Amber #f59e0b, Text #f8fafc

const BG_DARK = "#090d16";
const BG_PANEL = "#111827";
const BG_CARD = "#1e293b";
const VIOLET = "#8b5cf6";
const VIOLET_LIGHT = "#a78bfa";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED_ACCENT = "#ef4444";
const TEXT_LIGHT = "#f8fafc";
const TEXT_MUTED = "#94a3b8";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Background grid and living ambient particles
const AmbientGrid: React.FC<{ variant?: "default" | "warning" | "engine" | "showcase" }> = ({
  variant = "default",
}) => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.4) % 60;
  const glowAlpha = 0.15 + 0.05 * Math.sin(frame * 0.08);

  const glowColor =
    variant === "warning"
      ? `rgba(239, 68, 68, ${glowAlpha})`
      : variant === "engine"
      ? `rgba(139, 92, 246, ${glowAlpha + 0.05})`
      : variant === "showcase"
      ? `rgba(16, 185, 129, ${glowAlpha})`
      : `rgba(139, 92, 246, ${glowAlpha})`;

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: BG_DARK }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(1000px 700px at 50% 45%, ${glowColor}, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: -60,
          backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          transform: `translateY(${drift}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 1: HOOK (Global Reach)
// "Your ideas speak one language. Your market speaks ten."
// ==========================================
export const SlideVersoHook: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Continuous subtle camera push
  const camScale = interpolate(frame, [0, 150], [1.0, 1.05], {
    extrapolateRight: "clamp",
  });

  // Entrance spring for main headline
  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  // Second punchline transition ("Your market speaks ten")
  const splitFrame = 35;
  const turnProgress = interpolate(frame, [splitFrame, splitFrame + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  // Expanding language nodes
  const languages = [
    { code: "EN", name: "English", x: 180, y: 320, color: "#94a3b8" },
    { code: "JA", name: "日本語", x: 1400, y: 240, color: VIOLET_LIGHT },
    { code: "DE", name: "Deutsch", x: 1520, y: 520, color: AMBER },
    { code: "FR", name: "Français", x: 1350, y: 780, color: "#38bdf8" },
    { code: "ES", name: "Español", x: 320, y: 740, color: EMERALD },
  ];

  return (
    <AbsoluteFill
      style={{
        fontFamily: brand?.font || "Inter, system-ui, sans-serif",
        color: TEXT_LIGHT,
      }}
    >
      <AmbientGrid variant="default" />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${camScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* SVG Network Arcs */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {languages.map((lang, idx) => {
            const arcProgress = interpolate(
              frame,
              [splitFrame + idx * 4, splitFrame + idx * 4 + 18],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return (
              <line
                key={lang.code}
                x1={width / 2}
                y1={height / 2}
                x2={lang.x + 80}
                y2={lang.y + 35}
                stroke={lang.color}
                strokeWidth={2}
                strokeDasharray="6 6"
                strokeOpacity={arcProgress * 0.5}
              />
            );
          })}
        </svg>

        {/* Orbiting Language Badges */}
        {languages.map((lang, idx) => {
          const nodeSpring = spring({
            frame: frame - (splitFrame + idx * 5),
            fps,
            config: { damping: 12, stiffness: 120 },
          });
          const floatY = Math.sin(frame * 0.05 + idx * 1.5) * 8;

          return (
            <div
              key={lang.code}
              style={{
                position: "absolute",
                left: lang.x,
                top: lang.y + floatY,
                transform: `scale(${Math.max(0, nodeSpring)})`,
                opacity: Math.max(0, nodeSpring),
                background: "rgba(30, 41, 59, 0.85)",
                backdropFilter: "blur(12px)",
                border: `1.5px solid ${lang.color}88`,
                borderRadius: 16,
                padding: "12px 24px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${lang.color}22`,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `${lang.color}22`,
                  border: `1px solid ${lang.color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 800,
                  color: lang.color,
                }}
              >
                {lang.code}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: TEXT_LIGHT }}>
                {lang.name}
              </div>
            </div>
          );
        })}

        {/* Main Central Typography */}
        <div
          style={{
            zIndex: 10,
            textAlign: "center",
            maxWidth: 1100,
            padding: "0 40px",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: VIOLET_LIGHT,
              marginBottom: 20,
              opacity: titleSpring,
              transform: `translateY(${(1 - titleSpring) * 15}px)`,
            }}
          >
            SlideVerso · AI Presentation Translation
          </div>

          <h1
            style={{
              fontSize: 66,
              fontWeight: 800,
              lineHeight: 1.15,
              margin: 0,
              letterSpacing: -1.5,
              opacity: titleSpring,
              transform: `translateY(${(1 - titleSpring) * 25}px)`,
            }}
          >
            Presenting to a global client tomorrow?
          </h1>

          <div
            style={{
              marginTop: 24,
              fontSize: 70,
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: -2,
              opacity: turnProgress,
              transform: `translateY(${(1 - turnProgress) * 30}px)`,
              background: `linear-gradient(135deg, #ffffff 30%, ${VIOLET_LIGHT} 70%, ${EMERALD} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Translate your entire deck in seconds.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 2: PROBLEM (The Broken Layout Trap)
// "Translating presentations used to mean broken layouts, clipped boxes, and wasted executive hours."
// ==========================================
export const SlideVersoProblem: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Subtle continuous push
  const camScale = interpolate(frame, [0, 200], [1.0, 1.04]);

  // Entrance
  const enterSpring = spring({ frame, fps, config: { damping: 15, stiffness: 100 } });

  // Disaster trigger: manual translation breaks the slide at frame 40
  const breakFrame = 40;
  const breakProgress = interpolate(frame, [breakFrame, breakFrame + 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  // Glitch jitter during breakage
  const isJittering = frame >= breakFrame && frame <= breakFrame + 15;
  const jitterX = isJittering ? (Math.random() - 0.5) * 8 : 0;
  const jitterY = isJittering ? (Math.random() - 0.5) * 8 : 0;

  return (
    <AbsoluteFill
      style={{
        fontFamily: brand?.font || "Inter, system-ui, sans-serif",
        color: TEXT_LIGHT,
      }}
    >
      <AmbientGrid variant="warning" />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${camScale}) translate(${jitterX}px, ${jitterY}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 80px",
        }}
      >
        {/* Floating Problem Banner */}
        <div
          style={{
            position: "absolute",
            top: 60,
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            padding: "10px 24px",
            borderRadius: 999,
            opacity: enterSpring,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: RED_ACCENT,
              boxShadow: `0 0 12px ${RED_ACCENT}`,
            }}
          />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.5, color: "#fca5a5", textTransform: "uppercase" }}>
            The Copy-Paste Translation Nightmare (DeepL & Google Translate)
          </span>
        </div>

        {/* Mock Executive Slide Container */}
        <div
          style={{
            width: 1200,
            height: 640,
            marginTop: 40,
            background: BG_PANEL,
            borderRadius: 24,
            border: "2px solid #334155",
            boxShadow: "0 25px 60px -15px rgba(0,0,0,0.8)",
            padding: 48,
            position: "relative",
            overflow: "hidden",
            opacity: enterSpring,
            transform: `translateY(${(1 - enterSpring) * 40}px)`,
          }}
        >
          {/* Slide Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155", paddingBottom: 24 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: VIOLET_LIGHT, letterSpacing: 1 }}>EXECUTIVE BRIEFING · Q4 EXPANSION</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>
                {breakProgress > 0.5 ? "Globale Wachstumsstrategie und Marktdurchdringung" : "Global Growth & Market Penetration"}
              </div>
            </div>
            <div style={{ padding: "6px 16px", borderRadius: 8, background: "#1e293b", fontSize: 14, color: TEXT_MUTED }}>
              Slide 14 of 48
            </div>
          </div>

          {/* 3 Presentation Cards (showing severe text overflow and broken layout) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28, marginTop: 36 }}>
            {/* Card 1: Overflow Card */}
            <div
              style={{
                background: BG_CARD,
                borderRadius: 16,
                padding: 28,
                border: breakProgress > 0.3 ? `2px solid ${RED_ACCENT}` : "1px solid #334155",
                position: "relative",
                height: 340,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: AMBER }}>METRIC 01</div>
              <div style={{ fontSize: 36, fontWeight: 900, marginTop: 8 }}>+148%</div>
              <div
                style={{
                  fontSize: 16,
                  lineHeight: 1.5,
                  marginTop: 16,
                  color: TEXT_MUTED,
                  overflow: "hidden",
                  height: breakProgress > 0.3 ? 180 : 120,
                  borderBottom: breakProgress > 0.3 ? `2px dashed ${RED_ACCENT}` : "none",
                }}
              >
                {breakProgress > 0.3 ? (
                  <span style={{ color: "#fca5a5" }}>
                    Erheblicher Anstieg des wiederkehrenden Gesamtumsatzes durch optimierte Vertriebsprozesse und internationale Skalierungseffekte über alle Regionen hinweg... [TRUNCATED]
                  </span>
                ) : (
                  "Accelerated annual recurring revenue across strategic enterprise accounts in primary expansion corridors."
                )}
              </div>

              {/* Alert Badge */}
              {breakProgress > 0.4 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -15,
                    right: 15,
                    background: RED_ACCENT,
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 13,
                    padding: "6px 14px",
                    borderRadius: 8,
                    boxShadow: "0 4px 14px rgba(239,68,68,0.5)",
                    transform: "rotate(-3deg)",
                  }}
                >
                  ⚠️ TEXT OVERFLOW +46%
                </div>
              )}
            </div>

            {/* Card 2: Clipped Box Card */}
            <div
              style={{
                background: BG_CARD,
                borderRadius: 16,
                padding: 28,
                border: breakProgress > 0.5 ? `2px solid ${RED_ACCENT}` : "1px solid #334155",
                position: "relative",
                height: 340,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: EMERALD }}>METRIC 02</div>
              <div style={{ fontSize: 36, fontWeight: 900, marginTop: 8 }}>24 Days</div>
              <div style={{ fontSize: 16, lineHeight: 1.5, marginTop: 16, color: TEXT_MUTED }}>
                {breakProgress > 0.5 ? (
                  <span style={{ color: "#fca5a5" }}>
                    Durchschnittliche Verkaufszyklusdauer verkürzt sich signifikant um... [BOX CLIPPED]
                  </span>
                ) : (
                  "Average sales cycle reduction for multinational enterprise deployments."
                )}
              </div>

              {breakProgress > 0.6 && (
                <div
                  style={{
                    position: "absolute",
                    top: 15,
                    right: 15,
                    background: RED_ACCENT,
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 13,
                    padding: "6px 14px",
                    borderRadius: 8,
                    boxShadow: "0 4px 14px rgba(239,68,68,0.5)",
                  }}
                >
                  ✕ CONTAINER COLLAPSE
                </div>
              )}
            </div>

            {/* Card 3: Wasted Hours Counter */}
            <div
              style={{
                background: BG_CARD,
                borderRadius: 16,
                padding: 28,
                border: breakProgress > 0.7 ? `2px solid ${AMBER}` : "1px solid #334155",
                position: "relative",
                height: 340,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 56, fontWeight: 900, color: breakProgress > 0.7 ? AMBER : TEXT_LIGHT }}>
                {Math.round(interpolate(breakProgress, [0, 1], [0, 18]))} hrs
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: breakProgress > 0.7 ? AMBER : TEXT_MUTED, marginTop: 8 }}>
                Wasted Reformatting Decks
              </div>
              <div style={{ fontSize: 14, color: TEXT_MUTED, marginTop: 8 }}>
                Manual font resizing, shifting boxes, checking line wraps.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 3: THE TURN / ENGINE (The Coherence Contract)
// "SlideVerso changes the equation. Upload a PPTX or connect Google Slides. Our engine guarantees whole-deck layout coherence."
// ==========================================
export const SlideVersoEngine: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camScale = interpolate(frame, [0, 240], [1.0, 1.05]);
  const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // Laser scan line running across the deck
  const scanProgress = interpolate(frame, [25, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t,
  });

  // Engine metric reveals
  const m1 = interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m2 = interpolate(frame, [65, 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m3 = interpolate(frame, [90, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m4 = interpolate(frame, [115, 135], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        fontFamily: brand?.font || "Inter, system-ui, sans-serif",
        color: TEXT_LIGHT,
      }}
    >
      <AmbientGrid variant="engine" />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${camScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 80px",
        }}
      >
        {/* Header Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(139, 92, 246, 0.15)",
            border: `1.5px solid ${VIOLET}88`,
            padding: "8px 24px",
            borderRadius: 999,
            marginBottom: 24,
            opacity: enterSpring,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: EMERALD,
              boxShadow: `0 0 10px ${EMERALD}`,
            }}
          />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.5, color: VIOLET_LIGHT }}>
            ZERO-TOUCH PRESENTATION TRANSLATOR · 30+ LANGUAGES
          </span>
        </div>

        {/* Main Workspace Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 36, width: 1240, height: 620 }}>
          {/* Left: Interactive Scanning Deck */}
          <div
            style={{
              background: BG_PANEL,
              borderRadius: 20,
              border: `2px solid ${VIOLET}66`,
              padding: 32,
              position: "relative",
              overflow: "hidden",
              boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 30px ${VIOLET}22`,
            }}
          >
            {/* Top Deck Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ padding: "6px 14px", borderRadius: 8, background: "#1e293b", fontSize: 13, fontWeight: 700, color: "#fff" }}>
                  📁 quarterly-pitch.pptx
                </span>
                <span style={{ padding: "6px 14px", borderRadius: 8, background: "#1e293b", fontSize: 13, fontWeight: 700, color: "#38bdf8" }}>
                  Google Slides Linked
                </span>
                <span style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(16,185,129,0.2)", fontSize: 13, fontWeight: 700, color: EMERALD }}>
                  Target: 日本語 · Deutsch
                </span>
              </div>
              <div style={{ color: EMERALD, fontSize: 14, fontWeight: 800 }}>
                TRANSLATING: {Math.round(scanProgress * 100)}%
              </div>
            </div>

            {/* Mock Presentation Slide Under Scan */}
            <div
              style={{
                background: BG_CARD,
                borderRadius: 16,
                padding: 28,
                height: 440,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 800 }}>Enterprise AI Transformation Architecture</div>
              <div style={{ fontSize: 14, color: TEXT_MUTED, marginTop: 8 }}>Cross-Border Infrastructure Execution</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 24 }}>
                <div style={{ background: "#0f172a", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: VIOLET_LIGHT }}>MODULE A</div>
                  <div style={{ fontSize: 14, color: TEXT_LIGHT, marginTop: 6 }}>Automated Bounding Box Fit</div>
                  <div style={{ fontSize: 12, color: EMERALD, marginTop: 4 }}>✓ Font auto-tuned 18pt → 15.4pt</div>
                </div>
                <div style={{ background: "#0f172a", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: AMBER }}>MODULE B</div>
                  <div style={{ fontSize: 14, color: TEXT_LIGHT, marginTop: 6 }}>Glossary Coherence Lock</div>
                  <div style={{ fontSize: 12, color: EMERALD, marginTop: 4 }}>✓ Unified Terminology Across 48 Slides</div>
                </div>
              </div>

              {/* Glowing Laser Scanline */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: `${scanProgress * 100}%`,
                  height: 4,
                  background: `linear-gradient(90deg, transparent, ${VIOLET_LIGHT}, #ffffff, ${EMERALD}, transparent)`,
                  boxShadow: `0 0 25px 4px ${VIOLET_LIGHT}`,
                }}
              />
            </div>
          </div>

          {/* Right: Real-time Telemetry & Verification Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Tile 1: Font Scaling */}
            <div
              style={{
                background: BG_PANEL,
                borderRadius: 16,
                padding: 24,
                border: "1px solid #334155",
                opacity: m1,
                transform: `translateX(${(1 - m1) * 30}px)`,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: VIOLET_LIGHT }}>GEOMETRY ENGINE</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Sub-Pixel Font & Margin Tuning</div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 6 }}>
                Calculates precise text box bounds before and after translation to prevent any visual clipping.
              </div>
            </div>

            {/* Tile 2: Coherence Gate */}
            <div
              style={{
                background: BG_PANEL,
                borderRadius: 16,
                padding: 24,
                border: "1px solid #334155",
                opacity: m2,
                transform: `translateX(${(1 - m2) * 30}px)`,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: EMERALD }}>WHOLE-DECK CONSISTENCY</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>100% Glossary Contract</div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 6 }}>
                Every financial term, product name, and acronym remains strictly unified from slide 1 to slide 60.
              </div>
            </div>

            {/* Tile 3: Complete-or-Refunded Gate */}
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                borderRadius: 16,
                padding: 24,
                border: `1.5px solid ${EMERALD}88`,
                opacity: m3,
                transform: `translateX(${(1 - m3) * 30}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>🛡️</span>
                <div style={{ fontSize: 18, fontWeight: 900, color: EMERALD }}>Complete or 100% Refunded</div>
              </div>
              <div style={{ fontSize: 13, color: TEXT_LIGHT, marginTop: 6 }}>
                Deterministic verification ensures you only pay for flawless presentation delivery.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 4: SHOWCASE (Pixel-Perfect Multi-Language Demo)
// "Every bullet, diagram, and table adapts seamlessly across Japanese, German, and French, with zero formatting loss."
// ==========================================
export const SlideVersoShowcase: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camScale = interpolate(frame, [0, 240], [1.0, 1.04]);
  const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // 3 Language Phases:
  // 0 - 75: English
  // 75 - 150: Japanese (日本語)
  // 150+: German (Deutsch)
  const langIndex = frame < 75 ? 0 : frame < 150 ? 1 : 2;

  const data = [
    {
      lang: "English (Source)",
      flag: "🇺🇸",
      title: "Global Supply Chain Optimization",
      subtitle: "Enterprise Logistics Performance Review",
      bullets: [
        { label: "Warehouse Throughput", val: "+34.8%", desc: "Automated fulfillment routing across all coastal distribution hubs" },
        { label: "Fulfillment Cycle", val: "1.2 Days", desc: "Average order dispatch speed for high-priority shipments" },
        { label: "Operating Efficiency", val: "99.4%", desc: "Autonomous inventory reconciliation with zero manual overrides" },
      ],
      tag: "ORIGINAL PPTX",
    },
    {
      lang: "Japanese (日本語)",
      flag: "🇯🇵",
      title: "グローバル・サプライチェーンの最適化",
      subtitle: "エンタープライズ物流パフォーマンス評価",
      bullets: [
        { label: "倉庫スループット", val: "+34.8%", desc: "主要な沿岸流通ハブ全体における自動フルフィルメント最適化" },
        { label: "フルフィルメント周期", val: "1.2 日", desc: "優先出荷における平均注文処理および発送スピード" },
        { label: "稼働効率", val: "99.4%", desc: "人手による介入を排除した自律型リアルタイム在庫照合" },
      ],
      tag: "PERFECT FIT · NO OVERFLOW",
    },
    {
      lang: "German (Deutsch)",
      flag: "🇩🇪",
      title: "Globale Lieferkettenoptimierung",
      subtitle: "Leistungsüberprüfung der Unternehmenslogistik",
      bullets: [
        { label: "Lagerdurchsatz", val: "+34.8%", desc: "Automatisierte Abwicklungssteuerung über alle Küstenverteilzentren" },
        { label: "Auftragszyklus", val: "1.2 Tage", desc: "Durchschnittliche Versandgeschwindigkeit für priorisierte Aufträge" },
        { label: "Betriebseffizienz", val: "99.4%", desc: "Autonomer Bestandsabgleich ohne jegliche manuelle Eingriffe" },
      ],
      tag: "COMPLEX COMPOUND WORDS ADAPTED",
    },
  ];

  const current = data[langIndex];

  return (
    <AbsoluteFill
      style={{
        fontFamily: brand?.font || "Inter, system-ui, sans-serif",
        color: TEXT_LIGHT,
      }}
    >
      <AmbientGrid variant="showcase" />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${camScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 80px",
        }}
      >
        {/* Language Switcher Tabs */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 24,
            opacity: enterSpring,
          }}
        >
          {data.map((item, idx) => {
            const active = idx === langIndex;
            return (
              <div
                key={item.lang}
                style={{
                  padding: "10px 24px",
                  borderRadius: 12,
                  background: active ? VIOLET : BG_PANEL,
                  color: active ? "#ffffff" : TEXT_MUTED,
                  fontWeight: 800,
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: `1.5px solid ${active ? VIOLET_LIGHT : "#334155"}`,
                  boxShadow: active ? `0 0 20px ${VIOLET}44` : "none",
                  transition: "all 0.3s ease",
                }}
              >
                <span>{item.flag}</span>
                <span>{item.lang}</span>
              </div>
            );
          })}
        </div>

        {/* Master Slide Canvas */}
        <div
          style={{
            width: 1220,
            height: 620,
            background: BG_PANEL,
            borderRadius: 24,
            border: `2px solid ${EMERALD}88`,
            boxShadow: `0 25px 60px rgba(0,0,0,0.7), 0 0 35px ${EMERALD}22`,
            padding: 44,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Header */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: EMERALD, letterSpacing: 2 }}>
                ✓ {current.tag}
              </div>
              <div style={{ background: "rgba(16,185,129,0.15)", color: EMERALD, padding: "4px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
                100% Geometry Guard
              </div>
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, marginTop: 12, color: TEXT_LIGHT }}>
              {current.title}
            </div>
            <div style={{ fontSize: 18, color: TEXT_MUTED, marginTop: 4 }}>
              {current.subtitle}
            </div>
          </div>

          {/* 3 Metric Cards with Perfect Alignment */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginTop: 24 }}>
            {current.bullets.map((b, i) => (
              <div
                key={i}
                style={{
                  background: BG_CARD,
                  borderRadius: 16,
                  padding: 24,
                  border: "1px solid #334155",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  height: 280,
                  position: "relative",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: VIOLET_LIGHT }}>{b.label}</div>
                  <div style={{ fontSize: 40, fontWeight: 900, marginTop: 8, color: i === 0 ? AMBER : i === 1 ? "#38bdf8" : EMERALD }}>
                    {b.val}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 15,
                    lineHeight: 1.5,
                    color: TEXT_LIGHT,
                    background: "rgba(15, 23, 42, 0.6)",
                    padding: 14,
                    borderRadius: 10,
                    border: "1px solid #1e293b",
                  }}
                >
                  {b.desc}
                </div>

                {/* Subtle boundary indicator */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 6,
                    right: 12,
                    fontSize: 11,
                    color: EMERALD,
                    fontWeight: 700,
                  }}
                >
                  ✓ BOUNDS VERIFIED
                </div>
              </div>
            ))}
          </div>

          {/* Footer Quality Stamp */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #334155", paddingTop: 16 }}>
            <div style={{ fontSize: 13, color: TEXT_MUTED }}>
              Preserves typography, line breaks, shape anchors, and whole-deck glossary.
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_LIGHT }}>
              SlideVerso Coherence Engine v2
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 5: CTA (Launch Call to Action)
// "Don't let broken decks slow down your expansion. Preview your first slide free at SlideVerso.com."
// ==========================================
export const SlideVersoCTA: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camScale = interpolate(frame, [0, 180], [1.0, 1.05]);
  const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // URL typing effect
  const urlFull = "slideverso.com";
  const urlChars = Math.min(urlFull.length, Math.floor(frame / 3));
  const urlDisplay = urlFull.slice(0, urlChars);
  const showCursor = Math.floor(frame / 8) % 2 === 0;

  return (
    <AbsoluteFill
      style={{
        fontFamily: brand?.font || "Inter, system-ui, sans-serif",
        color: TEXT_LIGHT,
      }}
    >
      <AmbientGrid variant="default" />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${camScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 80px",
          textAlign: "center",
        }}
      >
        {/* Glow badge */}
        <div
          style={{
            background: "rgba(139, 92, 246, 0.15)",
            border: `1.5px solid ${VIOLET}88`,
            padding: "8px 24px",
            borderRadius: 999,
            marginBottom: 28,
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: 2,
            color: VIOLET_LIGHT,
            opacity: enterSpring,
          }}
        >
          SLIDEVERSO · EXECUTIVE PRESENTATION TRANSLATION
        </div>

        {/* Hero headline */}
        <h1
          style={{
            fontSize: 64,
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: -1.5,
            maxWidth: 1000,
            margin: "0 0 28px 0",
            opacity: enterSpring,
            transform: `translateY(${(1 - enterSpring) * 20}px)`,
          }}
        >
          Never reformat a translated deck again.
        </h1>

        {/* Big Interactive-looking URL Card */}
        <div
          style={{
            background: "rgba(30, 41, 59, 0.85)",
            backdropFilter: "blur(16px)",
            border: `2px solid ${VIOLET}`,
            borderRadius: 24,
            padding: "24px 64px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 40px ${VIOLET}44`,
            opacity: enterSpring,
            transform: `scale(${enterSpring})`,
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -1, color: "#ffffff" }}>
            {urlDisplay}
            {showCursor && <span style={{ color: EMERALD }}>|</span>}
          </div>
        </div>

        {/* 3 Core Value Propositions */}
        <div
          style={{
            display: "flex",
            gap: 32,
            marginTop: 48,
            opacity: enterSpring,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, color: EMERALD }}>
            <span>✓</span> 1-Slide Free Watermarked Preview
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, color: VIOLET_LIGHT }}>
            <span>✓</span> PPTX & Google Slides
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, color: AMBER }}>
            <span>✓</span> Complete or 100% Refunded
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

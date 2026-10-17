import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// Brand Palette: Deep midnight #080b14, Indigo #6366f1, Electric Cyan #06b6d4, Emerald #10b981, Crisp White #f8fafc
const BG_DARK = "#080b14";
const BG_PANEL = "#0f172a";
const BG_CARD = "#1a2236";
const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#818cf8";
const CYAN = "#06b6d4";
const CYAN_LIGHT = "#67e8f9";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED_ACCENT = "#ef4444";
const TEXT_LIGHT = "#f8fafc";
const TEXT_MUTED = "#94a3b8";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Dynamic kinetic grid and floating ambient light rays
const LivingCanvas: React.FC<{ variant?: "default" | "problem" | "engine" | "embed" | "cta" }> = ({
  variant = "default",
}) => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.5) % 80;
  const pulse = 0.2 + 0.08 * Math.sin(frame * 0.06);

  const glowGradient =
    variant === "problem"
      ? `radial-gradient(1100px 700px at 50% 50%, rgba(239, 68, 68, ${pulse}), transparent 75%)`
      : variant === "engine"
      ? `radial-gradient(1000px 700px at 50% 40%, rgba(6, 182, 212, ${pulse + 0.05}), transparent 70%)`
      : variant === "embed"
      ? `radial-gradient(1000px 700px at 50% 50%, rgba(16, 185, 129, ${pulse}), transparent 70%)`
      : `radial-gradient(1200px 800px at 50% 45%, rgba(99, 102, 241, ${pulse}), transparent 75%)`;

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: BG_DARK }}>
      <div style={{ position: "absolute", inset: 0, background: glowGradient }} />
      <div
        style={{
          position: "absolute",
          inset: -80,
          backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          transform: `translateY(${drift}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 1: HOOK (Momentum Hook)
// "Static diagrams kill presentation momentum."
// ==========================================
export const FluxRecreatedHook: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const camScale = interpolate(frame, [0, 120], [1.0, 1.05]);
  const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // Shatter / energy burst at frame 30
  const shatterProgress = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  // Floating particles
  const particles = Array.from({ length: 16 }).map((_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const dist = interpolate(shatterProgress, [0, 1], [0, 220 + (i % 5) * 40]);
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    return { x, y, size: 4 + (i % 4) * 3 };
  });

  return (
    <AbsoluteFill style={{ fontFamily: brand?.font || "Inter, system-ui, sans-serif", color: TEXT_LIGHT }}>
      <LivingCanvas variant="default" />

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
        {/* Top Eyebrow */}
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: CYAN,
            marginBottom: 24,
            opacity: enterSpring,
          }}
        >
          FLUXDIAGRAM · ANIMATED PRESENTATION SYSTEMS
        </div>

        {/* Big Broken Box / Hero Typography */}
        <div style={{ position: "relative", textAlign: "center", maxWidth: 1100 }}>
          {/* Animated Particles from Shatter */}
          {shatterProgress > 0 &&
            particles.map((p, idx) => (
              <div
                key={idx}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: p.size,
                  height: p.size,
                  borderRadius: "50%",
                  background: idx % 2 === 0 ? CYAN : INDIGO_LIGHT,
                  boxShadow: `0 0 12px ${idx % 2 === 0 ? CYAN : INDIGO}`,
                  transform: `translate(${p.x}px, ${p.y}px)`,
                  opacity: 1 - shatterProgress * 0.8,
                }}
              />
            ))}

          <h1
            style={{
              fontSize: 76,
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: -2,
              margin: 0,
              opacity: enterSpring,
              transform: `translateY(${(1 - enterSpring) * 20}px)`,
            }}
          >
            Static diagrams{" "}
            <span
              style={{
                color: RED_ACCENT,
                textDecoration: "line-through",
                textDecorationColor: RED_ACCENT,
                opacity: 1 - shatterProgress * 0.3,
              }}
            >
              kill
            </span>{" "}
            presentation momentum.
          </h1>

          <div
            style={{
              marginTop: 32,
              fontSize: 48,
              fontWeight: 900,
              letterSpacing: -1,
              opacity: shatterProgress,
              transform: `scale(${0.9 + shatterProgress * 0.1})`,
              background: `linear-gradient(135deg, #ffffff 20%, ${CYAN_LIGHT} 60%, ${INDIGO_LIGHT} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Give your systems the motion they deserve.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 2: PROBLEM (The Dead Box Trap)
// "Your audience tunes out when complex architectures are trapped in motionless boxes."
// ==========================================
export const FluxRecreatedProblem: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camScale = interpolate(frame, [0, 160], [1.0, 1.04]);
  const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // Disengagement drop curve
  const dropProgress = interpolate(frame, [30, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  return (
    <AbsoluteFill style={{ fontFamily: brand?.font || "Inter, system-ui, sans-serif", color: TEXT_LIGHT }}>
      <LivingCanvas variant="problem" />

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
        {/* Alert Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(239, 68, 68, 0.15)",
            border: "1.5px solid rgba(239, 68, 68, 0.4)",
            padding: "8px 24px",
            borderRadius: 999,
            marginBottom: 28,
            opacity: enterSpring,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: RED_ACCENT, boxShadow: `0 0 12px ${RED_ACCENT}` }} />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.5, color: "#fca5a5", textTransform: "uppercase" }}>
            The Slide Deck Graveyard
          </span>
        </div>

        {/* Split comparison: Lifeless Diagram vs Plummeting Engagement */}
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 36, width: 1200, height: 560 }}>
          {/* Left: Messy Dead Diagram */}
          <div
            style={{
              background: BG_PANEL,
              borderRadius: 20,
              border: "1px solid #334155",
              padding: 32,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity: enterSpring,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_MUTED }}>TYPICAL SLIDE DIAGRAM</div>
              <span style={{ background: "rgba(239, 68, 68, 0.2)", color: "#fca5a5", padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                MOTIONLESS
              </span>
            </div>

            {/* Static Boxes with tangled connections */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, margin: "auto 0" }}>
              {["User Client", "Load Balancer", "Auth Service", "Billing API", "SQL Replica", "Redis Cache"].map((node, i) => (
                <div
                  key={node}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: 12,
                    padding: "20px 14px",
                    textAlign: "center",
                    fontSize: 15,
                    fontWeight: 600,
                    color: TEXT_MUTED,
                    boxShadow: "none",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>NODE 0{i + 1}</div>
                  {node}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>
              No visual flow · No execution sequence · Lost in 40+ slides
            </div>
          </div>

          {/* Right: Plunging Engagement Graph */}
          <div
            style={{
              background: BG_PANEL,
              borderRadius: 20,
              border: "1px solid rgba(239, 68, 68, 0.3)",
              padding: 32,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity: enterSpring,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: RED_ACCENT }}>AUDIENCE RETENTION</div>
              <div style={{ fontSize: 44, fontWeight: 900, marginTop: 8, color: "#ffffff" }}>
                -{Math.round(interpolate(dropProgress, [0, 1], [0, 68]))}%
              </div>
              <div style={{ fontSize: 14, color: TEXT_MUTED, marginTop: 4 }}>
                Attention cliff within 8 seconds of viewing static architecture boxes.
              </div>
            </div>

            {/* Simulated dropping SVG curve */}
            <svg width="100%" height="160" viewBox="0 0 300 120">
              <path
                d="M 10 20 Q 80 25, 140 60 T 290 110"
                fill="none"
                stroke={RED_ACCENT}
                strokeWidth="4"
                strokeDasharray="6 6"
              />
              <circle cx="290" cy="110" r="6" fill={RED_ACCENT} />
            </svg>

            <div style={{ background: "rgba(239, 68, 68, 0.1)", padding: 14, borderRadius: 10, border: "1px solid rgba(239, 68, 68, 0.3)" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fca5a5" }}>THE VERDICT:</div>
              <div style={{ fontSize: 12, color: TEXT_LIGHT, marginTop: 2 }}>
                Static visuals fail to communicate distributed systems and dynamic workflows.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 3: THE TURN / ENGINE (Natural Language Generation)
// "FluxDiagram turns your words into motion. Type any system or workflow, and watch the animation generate in seconds."
// ==========================================
export const FluxRecreatedEngine: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camScale = interpolate(frame, [0, 240], [1.0, 1.05]);
  const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // Typewriting prompt
  const fullPrompt = "Event-driven microservices architecture with Kafka cluster & real-time analytics";
  const promptChars = Math.min(fullPrompt.length, Math.floor(frame / 2.2));
  const currentPrompt = fullPrompt.slice(0, promptChars);

  // Generation trigger
  const genTrigger = frame >= 50;
  const genProgress = interpolate(frame, [50, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  // Animated pulse packets traveling along wires
  const wirePulse1 = (frame * 3) % 100;
  const wirePulse2 = (frame * 3 + 40) % 100;

  return (
    <AbsoluteFill style={{ fontFamily: brand?.font || "Inter, system-ui, sans-serif", color: TEXT_LIGHT }}>
      <LivingCanvas variant="engine" />

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
        {/* Top Feature Tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(6, 182, 212, 0.15)",
            border: `1.5px solid ${CYAN}88`,
            padding: "8px 24px",
            borderRadius: 999,
            marginBottom: 24,
            opacity: enterSpring,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: CYAN, boxShadow: `0 0 10px ${CYAN}` }} />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.5, color: CYAN_LIGHT }}>
            NATURAL LANGUAGE → ANIMATED SYSTEM
          </span>
        </div>

        {/* Main UI Window */}
        <div
          style={{
            width: 1220,
            height: 600,
            background: BG_PANEL,
            borderRadius: 24,
            border: `2px solid ${CYAN}66`,
            boxShadow: `0 25px 60px rgba(0,0,0,0.7), 0 0 35px ${CYAN}22`,
            padding: 36,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            opacity: enterSpring,
          }}
        >
          {/* AI Prompt Input Bar */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.9)",
              border: `1.5px solid ${genTrigger ? CYAN : INDIGO}`,
              borderRadius: 16,
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: `0 4px 20px ${genTrigger ? CYAN + "33" : "transparent"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, color: TEXT_LIGHT, fontWeight: 600 }}>
              <span style={{ color: CYAN, fontSize: 20 }}>✨</span>
              <span>{currentPrompt}</span>
              <span style={{ color: CYAN, opacity: Math.floor(frame / 6) % 2 === 0 ? 1 : 0 }}>|</span>
            </div>

            <div
              style={{
                background: genTrigger ? CYAN : INDIGO,
                color: genTrigger ? "#080b14" : "#ffffff",
                padding: "8px 20px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 0.5,
              }}
            >
              {genTrigger ? "ANIMATING..." : "GENERATE"}
            </div>
          </div>

          {/* Generated Living Kinetic Diagram Stage */}
          <div
            style={{
              background: BG_CARD,
              borderRadius: 16,
              height: 390,
              marginTop: 20,
              position: "relative",
              overflow: "hidden",
              border: "1px solid #334155",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              padding: "0 40px",
            }}
          >
            {/* SVG Connecting Light Pipelines */}
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              <line x1="220" y1="195" x2="480" y2="195" stroke={CYAN} strokeWidth="3" strokeDasharray="8 6" strokeOpacity={genProgress} />
              <line x1="600" y1="195" x2="860" y2="195" stroke={INDIGO_LIGHT} strokeWidth="3" strokeDasharray="8 6" strokeOpacity={genProgress} />
              <line x1="980" y1="195" x2="1140" y2="195" stroke={EMERALD} strokeWidth="3" strokeDasharray="8 6" strokeOpacity={genProgress} />
            </svg>

            {/* 4 Interactive Nodes */}
            {[
              { title: "API Gateway", sub: "Incoming Requests", color: CYAN, delay: 50 },
              { title: "Kafka Cluster", sub: "Event Streaming", color: INDIGO_LIGHT, delay: 65 },
              { title: "Analytics Workers", sub: "Parallel Compute", color: AMBER, delay: 80 },
              { title: "Live Dashboard", sub: "Real-time Metrics", color: EMERALD, delay: 95 },
            ].map((node, i) => {
              const nodeSpring = spring({
                frame: frame - node.delay,
                fps,
                config: { damping: 12, stiffness: 120 },
              });
              const floatY = Math.sin(frame * 0.06 + i * 1.5) * 6;

              return (
                <div
                  key={node.title}
                  style={{
                    zIndex: 10,
                    width: 220,
                    background: "#0f172a",
                    border: `2px solid ${node.color}`,
                    borderRadius: 16,
                    padding: 24,
                    textAlign: "center",
                    transform: `scale(${Math.max(0, nodeSpring)}) translateY(${floatY}px)`,
                    opacity: Math.max(0, nodeSpring),
                    boxShadow: `0 12px 30px rgba(0,0,0,0.6), 0 0 25px ${node.color}33`,
                  }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: node.color, margin: "0 auto 12px", boxShadow: `0 0 10px ${node.color}` }} />
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff" }}>{node.title}</div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 6 }}>{node.sub}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: node.color, marginTop: 12, padding: "3px 8px", borderRadius: 6, background: `${node.color}22` }}>
                    ● PULSING LIVE
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 4: EMBED EVERYWHERE (One-Click Native Embed)
// "Embed with one click directly into PowerPoint, Google Slides, or Keynote. Zero video editing required."
// ==========================================
export const FluxRecreatedEmbed: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camScale = interpolate(frame, [0, 220], [1.0, 1.04]);
  const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  const platforms = [
    { name: "PowerPoint", icon: "P", color: "#ea580c", sub: "Native Add-in & Link" },
    { name: "Google Slides", icon: "S", color: "#eab308", sub: "Live Dynamic Preview" },
    { name: "Apple Keynote", icon: "K", color: "#0284c7", sub: "Interactive Web Object" },
  ];

  return (
    <AbsoluteFill style={{ fontFamily: brand?.font || "Inter, system-ui, sans-serif", color: TEXT_LIGHT }}>
      <LivingCanvas variant="embed" />

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
        {/* Top Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(16, 185, 129, 0.15)",
            border: `1.5px solid ${EMERALD}88`,
            padding: "8px 24px",
            borderRadius: 999,
            marginBottom: 24,
            opacity: enterSpring,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: EMERALD, boxShadow: `0 0 10px ${EMERALD}` }} />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.5, color: EMERALD }}>
            UNIVERSAL EMBED · ZERO VIDEO EDITING
          </span>
        </div>

        {/* 3 Presentation Platform Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32, width: 1200 }}>
          {platforms.map((p, idx) => {
            const cardSpring = spring({
              frame: frame - idx * 10,
              fps,
              config: { damping: 12, stiffness: 100 },
            });
            const floatY = Math.sin(frame * 0.05 + idx * 1.5) * 8;

            return (
              <div
                key={p.name}
                style={{
                  background: BG_PANEL,
                  borderRadius: 24,
                  border: `2px solid ${p.color}88`,
                  padding: 36,
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  boxShadow: `0 20px 45px rgba(0,0,0,0.6), 0 0 30px ${p.color}22`,
                  transform: `scale(${Math.max(0, cardSpring)}) translateY(${floatY}px)`,
                  opacity: Math.max(0, cardSpring),
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: `${p.color}22`,
                    border: `2px solid ${p.color}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 36,
                    fontWeight: 900,
                    color: p.color,
                    marginBottom: 20,
                  }}
                >
                  {p.icon}
                </div>

                <div style={{ fontSize: 26, fontWeight: 800, color: "#ffffff" }}>{p.name}</div>
                <div style={{ fontSize: 15, color: TEXT_MUTED, marginTop: 8 }}>{p.sub}</div>

                <div
                  style={{
                    marginTop: 24,
                    padding: "8px 18px",
                    borderRadius: 10,
                    background: "rgba(16, 185, 129, 0.15)",
                    color: EMERALD,
                    fontSize: 13,
                    fontWeight: 800,
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  ✓ ONE-CLICK READY
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature Banner */}
        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 40,
            fontSize: 16,
            fontWeight: 700,
            color: TEXT_LIGHT,
            opacity: enterSpring,
          }}
        >
          <div>✓ No MP4 export re-uploads</div>
          <div>✓ Native SVG vector resolution</div>
          <div>✓ Plays automatically on slide focus</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ==========================================
// SCENE 5: CTA (Launch Call to Action)
// "Make your ideas impossible to ignore. Create your first animated diagram free at fluxdiagram dot app."
// ==========================================
export const FluxRecreatedCTA: React.FC<any> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camScale = interpolate(frame, [0, 200], [1.0, 1.05]);
  const enterSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });

  // URL typing
  const urlFull = "fluxdiagram.app";
  const urlChars = Math.min(urlFull.length, Math.floor(frame / 2.8));
  const urlDisplay = urlFull.slice(0, urlChars);
  const showCursor = Math.floor(frame / 8) % 2 === 0;

  return (
    <AbsoluteFill style={{ fontFamily: brand?.font || "Inter, system-ui, sans-serif", color: TEXT_LIGHT }}>
      <LivingCanvas variant="cta" />

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
        <div
          style={{
            background: "rgba(99, 102, 241, 0.15)",
            border: `1.5px solid ${INDIGO}88`,
            padding: "8px 24px",
            borderRadius: 999,
            marginBottom: 28,
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: 2,
            color: INDIGO_LIGHT,
            opacity: enterSpring,
          }}
        >
          START FOR FREE · NO CREDIT CARD REQUIRED
        </div>

        <h1
          style={{
            fontSize: 66,
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: -1.5,
            maxWidth: 1000,
            margin: "0 0 32px 0",
            opacity: enterSpring,
            transform: `translateY(${(1 - enterSpring) * 20}px)`,
          }}
        >
          Make your ideas impossible to ignore.
        </h1>

        {/* Glow URL Card */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(16px)",
            border: `2px solid ${CYAN}`,
            borderRadius: 24,
            padding: "24px 64px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 45px ${CYAN}44`,
            opacity: enterSpring,
            transform: `scale(${enterSpring})`,
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -1, color: "#ffffff" }}>
            {urlDisplay}
            {showCursor && <span style={{ color: CYAN }}>|</span>}
          </div>
        </div>

        {/* Core Pillars */}
        <div style={{ display: "flex", gap: 36, marginTop: 44, opacity: enterSpring }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, color: CYAN }}>
            <span>✓</span> Text-to-Diagram AI
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, color: INDIGO_LIGHT }}>
            <span>✓</span> 60 FPS Vector Motion
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, color: EMERALD }}>
            <span>✓</span> Embed in 3 Clicks
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

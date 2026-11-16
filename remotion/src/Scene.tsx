import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { components } from "./components";
import { Captions } from "./Captions";
import { GraphicsLayer } from "./Graphics";

// Assets are staged into remotion/public/<project>/... by the compositor adapter,
// so they resolve via staticFile. Code-source scenes need no asset (the zero-key path).
const asset = (p: string) => (p?.startsWith("http") ? p : staticFile(p));

const sceneMs = (s: any) =>
  s.duration_ms ?? (s.duration_estimate_s ?? 4) * 1000;

// Ken-Burns: gives stills cinematic motion (push / pan / handheld drift) keyed off
// visual.shot.motion. Always slightly over-scaled so drift never reveals frame edges.
// objectPosition lets a still bias its crop (e.g. keep a right-of-centre subject in 9:16).
const KenBurns = ({ src, shot, durationMs, fit, position }: any) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, (durationMs / 1000) * fps);
  const p = Math.min(1, Math.max(0, frame / total));
  const motion = shot?.motion || "push";

  let scale = interpolate(p, [0, 1], [1.04, 1.1]);
  let tx = 0;
  let ty = 0;
  if (motion === "pan") {
    scale = 1.1;
    tx = interpolate(p, [0, 1], [-3, 3]);
  } else if (motion === "handheld") {
    scale = interpolate(p, [0, 1], [1.06, 1.12]);
    tx = interpolate(p, [0, 1], [-1.4, 1.2]);
    ty = interpolate(p, [0, 1], [1, -1]);
  } else if (motion === "static") {
    scale = interpolate(p, [0, 1], [1.02, 1.06]);
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit || "cover",
          objectPosition: position || "center",
          transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// Text OVER a photo/clip — a lower-third or centred hero line, so narration/hook/quotes ride
// on the real footage instead of a flat text card. eyebrow = small kicker; text = the line.
const Overlay = ({ overlay, brand }: any) => {
  const frame = useCurrentFrame();
  const accent = brand?.palette?.[1] ?? "#3B82F6";
  const font = brand?.font ?? "Inter, system-ui, sans-serif";
  const o = typeof overlay === "string" ? { text: overlay } : overlay;
  const center = o.position === "center";
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
  });
  const { width } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        justifyContent: center ? "center" : "flex-end",
        alignItems: center ? "center" : "flex-start",
        padding: center ? "8%" : "0 7% 9%",
        textAlign: center ? "center" : "left",
        fontFamily: font,
      }}
    >
      <div style={{ opacity, maxWidth: "86%" }}>
        {o.eyebrow ? (
          <div
            style={{
              color: accent,
              fontWeight: 800,
              fontSize: Math.round(width * 0.016),
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 12,
              textShadow: "0 2px 14px rgba(0,0,0,0.6)",
            }}
          >
            {o.eyebrow}
          </div>
        ) : null}
        <div
          style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: Math.round(width * (center ? 0.046 : 0.034)),
            lineHeight: 1.15,
            textShadow: "0 3px 22px rgba(0,0,0,0.75)",
          }}
        >
          {o.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Bottom scrim so overlay/caption text stays legible over bright footage.
const Scrim = ({ center }: any) => (
  <AbsoluteFill
    style={{
      background: center
        ? "radial-gradient(ellipse at center, rgba(3,16,40,0.35) 0%, rgba(3,16,40,0.72) 100%)"
        : "linear-gradient(to top, rgba(3,16,40,0.82) 0%, rgba(3,16,40,0.25) 34%, rgba(3,16,40,0) 60%)",
    }}
  />
);

const TechTestPlaceholder = ({ scene }: any) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames)));
  const sec = (t: number) => `${(t / 1000).toFixed(2)}s`;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a1018",
        color: "#cbd5e1",
        fontFamily: "Inter, system-ui, sans-serif",
        justifyContent: "center",
        alignItems: "center",
        padding: "6%",
      }}
    >
      <div
        style={{
          border: "2px dashed #38bdf8",
          borderRadius: 12,
          padding: "40px 56px",
          maxWidth: 1100,
          width: "100%",
          background: "rgba(15, 23, 42, 0.85)",
        }}
      >
        <div style={{ color: "#f59e0b", fontSize: 22, fontWeight: 700, letterSpacing: 2, marginBottom: 14 }}>
          INTERNAL QA TECH TEST PLACEHOLDER — NO MEDIA ASSET
        </div>
        <div style={{ fontSize: 44, fontWeight: 800, color: "#f8fafc", marginBottom: 12 }}>
          {scene.id}{scene.title ? ` — ${scene.title}` : ""}
        </div>
        <div style={{ fontSize: 24, color: "#94a3b8", marginBottom: 18 }}>
          {scene.in_ms != null && scene.out_ms != null ? `${sec(scene.in_ms)} → ${sec(scene.out_ms)}` : ""}
          {scene.camera_side ? ` · Camera: ${scene.camera_side}` : ""}
          {scene.eye_state ? ` · Eye: ${scene.eye_state}` : ""}
          {scene.requires_lipsync ? " · Lip-sync: YES" : ""}
        </div>
        {scene.placeholder_label ? (
          <div style={{ fontSize: 26, color: "#e2e8f0", marginBottom: 22 }}>{scene.placeholder_label}</div>
        ) : null}
        <div style={{ height: 6, width: "100%", background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(p * 100).toFixed(2)}%`, background: "#38bdf8" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Scene = ({ scene, brand, mode }: any) => {
  const v = scene.visual ?? {};
  const bg = brand?.palette?.[0] ?? "#0b0b0f";
  const hasMedia = !!v.asset && (v.source === "image" || v.source === "clip");
  const isMusic = mode === "music";

  let visual: any;
  if (v.source === "placeholder") {
    if (!scene.tech_test_placeholder) {
      throw new Error(`Scene ${scene.id}: placeholder requires tech_test_placeholder=true`);
    }
    visual = <TechTestPlaceholder scene={scene} />;
  } else if (v.source === "code") {
    // pass the narration as a default body; let the agent's props (headline/subtext/
    // eyebrow/value/label/bg/accent) override. Do NOT pass scene.title — it's an
    // internal label, not on-screen copy.
    const C = components[v.component] ?? components.TitleCard;
    const card = <C text={scene.tts_script} {...(v.props || {})} brand={brand} />;
    // a card with graphics moves up and leaves the lower third to them
    visual = scene.graphics?.length ? (
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "66%" }}>
        {card}
      </div>
    ) : (
      card
    );
  } else if (v.asset && v.source === "image") {
    visual = (
      <KenBurns
        src={asset(v.asset)}
        shot={v.shot}
        durationMs={sceneMs(scene)}
        fit={v.fit}
        position={v.objectPosition}
      />
    );
  } else if (v.asset) {
    visual = (
      <OffthreadVideo
        src={asset(v.asset)}
        muted={isMusic && !scene.keep_clip_audio}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  } else if (isMusic) {
    throw new Error(`Scene ${scene.id}: missing visual.asset in music mode (title-card substitution forbidden)`);
  } else {
    // Degrade gracefully: no produced asset yet → title-card fallback.
    const C = components.TitleCard;
    visual = <C text={scene.tts_script} brand={brand} />;
  }

  const overlayOnMedia = hasMedia && v.overlay;
  const scrim =
    hasMedia &&
    (v.overlay || (scene.captions !== "none" && scene.word_timings?.length));

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      {visual}
      {scrim ? <Scrim center={v.overlay?.position === "center"} /> : null}
      {overlayOnMedia ? <Overlay overlay={v.overlay} brand={brand} /> : null}
      <GraphicsLayer scene={scene} brand={brand} />
      {scene._audio ? <Audio src={asset(scene._audio)} /> : null}
      {(scene._sfx ?? []).map((p: string, i: number) => (
        <Audio key={i} src={asset(p)} volume={brand?.sfx_volume ?? 0.7} />
      ))}
      {scene.captions !== "none" && scene.word_timings?.length ? (
        <Captions words={scene.word_timings} brand={brand} />
      ) : null}
    </AbsoluteFill>
  );
};

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

export const Scene = ({ scene, brand }: any) => {
  const v = scene.visual ?? {};
  const bg = brand?.palette?.[0] ?? "#0b0b0f";
  const hasMedia = !!v.asset && (v.source === "image" || v.source === "clip");

  let visual: any;
  if (v.source === "code") {
    // pass the narration as a default body; let the agent's props (headline/subtext/
    // eyebrow/value/label/bg/accent) override. Do NOT pass scene.title — it's an
    // internal label, not on-screen copy.
    const C = components[v.component] ?? components.TitleCard;
    visual = <C text={scene.tts_script} {...(v.props || {})} brand={brand} />;
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
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
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

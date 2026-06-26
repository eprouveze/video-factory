import { AbsoluteFill, Audio, Img, OffthreadVideo, staticFile } from "remotion";
import { components } from "./components";
import { Captions } from "./Captions";

// Assets are staged into remotion/public/<project>/... by the compositor adapter,
// so they resolve via staticFile. Code-source scenes need no asset (the zero-key path).
const asset = (p: string) => (p?.startsWith("http") ? p : staticFile(p));

export const Scene = ({ scene, brand }: any) => {
  const v = scene.visual ?? {};
  const bg = brand?.palette?.[0] ?? "#0b0b0f";

  let visual: any;
  if (v.source === "code") {
    const C = components[v.component] ?? components.TitleCard;
    // pass the narration as a default body; let the agent's props (headline/subtext/
    // eyebrow/value/label/bg/accent) override. Do NOT pass scene.title — it's an
    // internal label, not on-screen copy.
    visual = <C text={scene.tts_script} {...(v.props || {})} brand={brand} />;
  } else if (v.asset && v.source === "image") {
    visual = (
      <Img
        src={asset(v.asset)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
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

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      {visual}
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

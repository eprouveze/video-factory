import { Composition } from "remotion";
import { Video } from "./Video";
import example from "../../examples/manifest.example.json";

const DIMS: Record<string, [number, number]> = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
};

const sceneMs = (s: any) =>
  s.duration_ms ??
  (s.in_ms != null && s.out_ms != null ? s.out_ms - s.in_ms : (s.duration_estimate_s ?? 4) * 1000);

const totalFramesFor = (m: any, fps: number) => {
  const scenes = m?.scenes ?? [];
  if (m?.mode === "music" && m?.audio_master_duration_ms) {
    return Math.max(1, Math.round((m.audio_master_duration_ms / 1000) * fps));
  }
  let acc = 0;
  for (const s of scenes) {
    if (s.in_ms != null && s.out_ms != null) {
      const startF = Math.round((s.in_ms / 1000) * fps);
      const endF = Math.max(startF + 1, Math.round((s.out_ms / 1000) * fps));
      acc = endF;
    } else {
      acc += Math.max(1, Math.round((sceneMs(s) / 1000) * fps));
    }
  }
  return Math.max(1, acc);
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="Video"
      component={Video as any}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ manifest: example as any, format: "16:9" }}
      calculateMetadata={({ props }: any) => {
        const m = props.manifest;
        const fps = m?.fps ?? 30;
        const [width, height] = DIMS[props.format] ?? DIMS["16:9"];
        return {
          durationInFrames: totalFramesFor(m, fps),
          fps,
          width,
          height,
        };
      }}
    />
  );
};

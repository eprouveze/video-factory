import { Composition } from "remotion";
import { Video } from "./Video";
import example from "../../examples/manifest.example.json";

const DIMS: Record<string, [number, number]> = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
};

const sceneMs = (s: any) =>
  s.duration_ms ?? (s.duration_estimate_s ?? 4) * 1000;

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
        const totalMs = (m?.scenes ?? []).reduce(
          (a: number, s: any) => a + sceneMs(s),
          0,
        );
        return {
          durationInFrames: Math.max(1, Math.round((totalMs / 1000) * fps)),
          fps,
          width,
          height,
        };
      }}
    />
  );
};

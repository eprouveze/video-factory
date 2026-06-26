import { Series, useVideoConfig } from "remotion";
import { Scene } from "./Scene";

const sceneMs = (s: any) =>
  s.duration_ms ?? (s.duration_estimate_s ?? 4) * 1000;

export const Video = ({ manifest, format }: any) => {
  const { fps } = useVideoConfig();
  const scenes = manifest?.scenes ?? [];
  return (
    <Series>
      {scenes.map((s: any) => {
        const dur = Math.max(1, Math.round((sceneMs(s) / 1000) * fps));
        return (
          <Series.Sequence key={s.id} durationInFrames={dur}>
            <Scene scene={s} brand={manifest?.brand} format={format} />
          </Series.Sequence>
        );
      })}
    </Series>
  );
};

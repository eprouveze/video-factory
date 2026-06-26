import {
  AbsoluteFill,
  Audio,
  Series,
  staticFile,
  useVideoConfig,
} from "remotion";
import { Scene } from "./Scene";

const sceneMs = (s: any) =>
  s.duration_ms ?? (s.duration_estimate_s ?? 4) * 1000;

const asset = (p: string) => (p?.startsWith("http") ? p : staticFile(p));

export const Video = ({ manifest, format }: any) => {
  const { fps } = useVideoConfig();
  const scenes = manifest?.scenes ?? [];
  // music bed: one low-volume track under the whole video (sound design, layer 4)
  const musicVol = manifest?.brand?.music_volume ?? 0.18;
  return (
    <AbsoluteFill>
      {manifest?.music ? (
        <Audio src={asset(manifest.music)} volume={musicVol} />
      ) : null}
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
    </AbsoluteFill>
  );
};

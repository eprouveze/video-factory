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

  // music bed with ducking: drop under narration, full elsewhere (sound design)
  const fullVol = manifest?.brand?.music_volume ?? 0.2;
  const duckVol = manifest?.brand?.music_duck_volume ?? 0.07;
  const RAMP = Math.max(1, Math.round(0.2 * fps));
  let acc = 0;
  const duckRanges: [number, number][] = [];
  for (const s of scenes) {
    const durF = Math.max(1, Math.round((sceneMs(s) / 1000) * fps));
    if (s._audio) duckRanges.push([acc, acc + durF]);
    acc += durF;
  }
  const musicVolume = (f: number) => {
    let duck = 0;
    for (const [a, b] of duckRanges) {
      if (f >= a && f < b) {
        duck = 1;
        break;
      }
      if (f >= a - RAMP && f < a)
        duck = Math.max(duck, (f - (a - RAMP)) / RAMP);
      if (f >= b && f < b + RAMP) duck = Math.max(duck, 1 - (f - b) / RAMP);
    }
    return fullVol + (duckVol - fullVol) * duck;
  };

  return (
    <AbsoluteFill>
      {manifest?.music ? (
        <Audio src={asset(manifest.music)} volume={musicVolume} />
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

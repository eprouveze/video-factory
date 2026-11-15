import {
  AbsoluteFill,
  Audio,
  Series,
  staticFile,
  useVideoConfig,
} from "remotion";
import { Scene } from "./Scene";
import { ThroughLine } from "./ThroughLine";

const sceneMs = (s: any) =>
  s.duration_ms ??
  (s.in_ms != null && s.out_ms != null ? s.out_ms - s.in_ms : (s.duration_estimate_s ?? 4) * 1000);

const sceneDurationFrames = (s: any, fps: number) => {
  if (s.in_ms != null && s.out_ms != null) {
    const startF = Math.round((s.in_ms / 1000) * fps);
    const endF = Math.max(startF + 1, Math.round((s.out_ms / 1000) * fps));
    return endF - startF;
  }
  return Math.max(1, Math.round((sceneMs(s) / 1000) * fps));
};

const asset = (p: string) => (p?.startsWith("http") ? p : staticFile(p));

export const Video = ({ manifest, format }: any) => {
  const { fps } = useVideoConfig();
  const scenes = manifest?.scenes ?? [];
  const isMusic = manifest?.mode === "music";
  const masterAudio = manifest?.audio_master_path || manifest?.music;

  // music bed with ducking in narration mode; unity gain (1.0) in music-first mode
  const fullVol = manifest?.brand?.music_volume ?? (isMusic ? 1.0 : 0.2);
  const duckVol = manifest?.brand?.music_duck_volume ?? (isMusic ? 1.0 : 0.07);
  const RAMP = Math.max(1, Math.round(0.2 * fps));
  let acc = 0;
  const duckRanges: [number, number][] = [];
  for (const s of scenes) {
    const durF = sceneDurationFrames(s, fps);
    if (s._audio) duckRanges.push([acc, acc + durF]);
    acc += durF;
  }
  const musicVolume = (f: number) => {
    if (isMusic) return fullVol;
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

  // first frame of every scene, for the through-line device
  const starts: Record<string, number> = {};
  let at = 0;
  for (const s of scenes) {
    starts[s.id] = at;
    at += sceneDurationFrames(s, fps);
  }

  return (
    <AbsoluteFill>
      {masterAudio ? (
        <Audio src={asset(masterAudio)} volume={musicVolume} />
      ) : null}
      <Series>
        {scenes.map((s: any) => {
          const dur = sceneDurationFrames(s, fps);
          return (
            <Series.Sequence key={s.id} durationInFrames={dur}>
              <Scene scene={s} brand={manifest?.brand} format={format} mode={manifest?.mode} />
            </Series.Sequence>
          );
        })}
      </Series>
      {manifest?.through_line ? (
        <ThroughLine
          device={manifest.through_line}
          starts={starts}
          brand={manifest?.brand}
        />
      ) : null}
    </AbsoluteFill>
  );
};

import React from "react";
import { Composition } from "remotion";
import { GeminiFlow } from "./GeminiFlow";
import { SceneListVideo } from "./SceneListVideo";
import sceneList from "./scene-list.json";

const sceneListFrames = (sceneList.scenes as { duration: number }[]).reduce(
  (a, s) => a + s.duration,
  0,
);

export const ExperimentRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GeminiFlow"
        component={GeminiFlow}
        durationInFrames={270}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="FluxSceneList"
        component={SceneListVideo as React.FC}
        durationInFrames={sceneListFrames}
        fps={sceneList.fps ?? 60}
        width={1920}
        height={1080}
        defaultProps={{ sceneList } as never}
      />
    </>
  );
};

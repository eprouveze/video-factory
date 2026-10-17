// Registry of code-animated scene components (the zero-key visual path).
// A manifest scene with visual.source = "code" sets visual.component to one of these keys.
import { TitleCard } from "./TitleCard";
import { StatCard } from "./StatCard";
import {
  FluxHook,
  FluxProblem,
  FluxHowItWorks,
  FluxShowcase,
  FluxCTA,
} from "./FluxScenes";

import {
  SlideVersoHook,
  SlideVersoProblem,
  SlideVersoEngine,
  SlideVersoShowcase,
  SlideVersoCTA,
} from "./SlideVersoScenes";

import {
  FluxRecreatedHook,
  FluxRecreatedProblem,
  FluxRecreatedEngine,
  FluxRecreatedEmbed,
  FluxRecreatedCTA,
} from "./FluxRecreatedScenes";

export const components: Record<string, any> = {
  TitleCard,
  StatCard,
  FluxHook,
  FluxProblem,
  FluxHowItWorks,
  FluxShowcase,
  FluxCTA,
  SlideVersoHook,
  SlideVersoProblem,
  SlideVersoEngine,
  SlideVersoShowcase,
  SlideVersoCTA,
  FluxRecreatedHook,
  FluxRecreatedProblem,
  FluxRecreatedEngine,
  FluxRecreatedEmbed,
  FluxRecreatedCTA,
};

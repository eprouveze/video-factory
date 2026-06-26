// Registry of code-animated scene components (the zero-key visual path).
// A manifest scene with visual.source = "code" sets visual.component to one of these keys.
import { TitleCard } from "./TitleCard";
import { StatCard } from "./StatCard";

export const components: Record<string, any> = {
  TitleCard,
  StatCard,
};

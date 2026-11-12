#!/usr/bin/env node
for await (const _ of process.stdin) {
}
process.stderr.write(
  "veo clip: Veo 3.1 Preview was shut down on 2026-10-22; use the `omni` clip adapter.\n",
);
process.exit(1);

// Spend control for paid adapter calls: the stop switch, the cap and the ledger live in the
// runner, so a plan cannot talk its way past them.
//   ledger.jsonl (project dir): {ts, capability, provider, scene, seconds, est_usd, real_usd}
// `est_usd` is a list-price estimate from providers.json and is never reported as spend;
// `real_usd` is filled only when the adapter returns a `cost_usd` from the provider.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export class SpendRefused extends Error {}

export function makeSpend({ projDir, manifest, registry }) {
  const ledgerPath = join(projDir, "ledger.jsonl");
  const read = () =>
    existsSync(ledgerPath)
      ? readFileSync(ledgerPath, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : [];
  const spent = () => read().reduce((a, r) => a + (r.real_usd ?? r.est_usd ?? 0), 0);

  // Run `fn` (the adapter call) for a capability, or throw SpendRefused before it runs.
  return function spend(capability, provider, { scene = null, seconds = 0 } = {}, fn) {
    const a = registry.capabilities?.[capability]?.adapters?.[provider];
    if (!a || a.tier === "core") return fn();
    const b = manifest.budget ?? {};
    if (b.frozen) throw new SpendRefused(`budget.frozen is set: ${capability}:${provider} not run`);
    const est =
      typeof a.est_usd === "number" ? (a.est_unit === "second" ? a.est_usd * seconds : a.est_usd) : null;
    if (typeof b.cap_usd === "number") {
      if (est === null)
        throw new SpendRefused(`a cap is set but ${capability}:${provider} has no est_usd in providers.json`);
      const after = spent() + est;
      if (after > b.cap_usd)
        throw new SpendRefused(
          `${capability}:${provider} would take spend to $${after.toFixed(2)}, over the $${b.cap_usd} cap`,
        );
    }
    const res = fn();
    appendFileSync(
      ledgerPath,
      JSON.stringify({
        ts: new Date().toISOString(),
        capability,
        provider,
        scene,
        seconds: +seconds.toFixed(2),
        est_usd: est,
        real_usd: typeof res?.cost_usd === "number" ? res.cost_usd : null,
      }) + "\n",
    );
    return res;
  };
}

#!/usr/bin/env node
// Record a person's approval of the plan. The approval is stored against a hash of the
// creative content, so any later edit makes it stale and the producer stops before spending.
// Run this only after a person has reviewed the storyboard and said yes.
//
// usage: node scripts/approve.mjs <manifest.json | project-dir> --by "<who said yes>"
import { writeFileSync } from "node:fs";
import { approvalHash } from "./lib/manifest-lib.mjs";
import { validate, loadManifest, loadRegistry } from "./validate-manifest.mjs";

const args = process.argv.slice(2);
const byAt = args.indexOf("--by");
const by = byAt >= 0 ? args[byAt + 1] : null;
const target = args.find((a, i) => !a.startsWith("--") && i !== byAt + 1);
if (!by) {
  process.stderr.write(
    'approve: --by "<name>" is required: an approval has to name the person who gave it\n',
  );
  process.exit(2);
}
const { path, manifest } = loadManifest(target);
delete manifest.approval;
const res = validate(manifest, { registry: loadRegistry() });
if (!res.pass) {
  res.errors.forEach((e) =>
    process.stderr.write(`ERROR [${e.gate}] ${e.scene ?? ""} ${e.message}\n`),
  );
  process.stderr.write(
    "approve: the plan fails its audit; fix it before asking for approval\n",
  );
  process.exit(1);
}
manifest.approval = {
  hash: approvalHash(manifest),
  by,
  at: new Date().toISOString(),
};
writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(
  `approved by ${by} · ${manifest.approval.hash.slice(0, 12)} · ${path}\n`,
);

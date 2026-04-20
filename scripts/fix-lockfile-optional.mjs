#!/usr/bin/env node
// One-shot lockfile repair.
//
// npm 10 has a long-standing bug (see npm/cli#4828 and friends) where
// regenerating a lockfile on a platform that can't install *any* of a
// package's platform-specific optional deps marks those entries with
// "extraneous": true instead of "optional": true. When CI (Linux) then
// runs `npm ci` against the lockfile, npm tries to install the non-Linux
// binaries as regular deps, hits EBADPLATFORM on the first non-matching
// OS, and bails.
//
// This script walks the lockfile, finds every nested @esbuild/* entry
// flagged "extraneous", and rewrites it to the shape npm would have
// produced if the lockfile had been generated on a matching platform
// (optional: true, dev: true, no "extraneous" flag).
//
// We target only @esbuild/* because that's the only tree hitting this
// today; extend the predicate if another pkg starts exhibiting the bug.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const lockfilePath = resolve(here, "..", "package-lock.json");

const raw = readFileSync(lockfilePath, "utf8");
const lock = JSON.parse(raw);

if (!lock.packages) {
  console.error("[fix-lockfile] no .packages map — aborting");
  process.exit(1);
}

let fixed = 0;
for (const [key, entry] of Object.entries(lock.packages)) {
  if (!key.includes("/node_modules/@esbuild/")) continue;
  if (entry.extraneous !== true) continue;
  delete entry.extraneous;
  entry.dev = true;
  entry.optional = true;
  fixed += 1;
}

writeFileSync(lockfilePath, JSON.stringify(lock, null, 2) + "\n");
console.log(`[fix-lockfile] normalized ${fixed} nested @esbuild/* entries`);

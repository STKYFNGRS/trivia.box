#!/usr/bin/env node
// Sequential verification pipeline used by the tester subagent.
// Stops on the first failing step and prints a concise summary so the
// repairer subagent can address it directly.

import { spawn } from "node:child_process";
import process from "node:process";

const steps = [
  { id: "lint", label: "ESLint", cmd: "npm", args: ["run", "lint"] },
  { id: "typecheck", label: "TypeScript", cmd: "npx", args: ["tsc", "--noEmit"] },
  { id: "test", label: "Vitest", cmd: "npx", args: ["vitest", "run", "--reporter=dot"] },
  { id: "build", label: "Next build", cmd: "npm", args: ["run", "build"] },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const runSteps = only.length ? steps.filter((s) => only.includes(s.id)) : steps;

function run(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    const proc = spawn(step.cmd, step.args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    proc.on("exit", (code) => {
      resolve({ step, code: code ?? 1, ms: Date.now() - started });
    });
  });
}

const results = [];
for (const step of runSteps) {
  console.log(`\n=== verify: ${step.label} (${step.id}) ===`);
  const r = await run(step);
  results.push(r);
  if (r.code !== 0) break;
}

console.log("\n=== verify summary ===");
for (const r of results) {
  console.log(`${r.code === 0 ? "PASS" : "FAIL"}  ${r.step.id.padEnd(10)}  ${r.ms}ms`);
}

const failed = results.find((r) => r.code !== 0);
process.exit(failed ? failed.code : 0);

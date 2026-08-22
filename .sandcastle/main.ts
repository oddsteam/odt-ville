import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

// Where the dev stack serves once it's up (compose.yaml maps frontend 5460:5460).
const TEST_URL = "http://localhost:5460/admin/objects";

// Simple loop: an agent that picks open issues one by one and closes them.
// Run this with: npx tsx .sandcastle/main.ts
// Or add to package.json scripts: "sandcastle": "npx tsx .sandcastle/main.ts"

const result = await run({
  // A name for this run, shown as a prefix in log output.
  name: "worker",

  // Sandbox provider — runs the agent inside an isolated container.
  sandbox: docker(),

  // The agent provider. Pass a model string to claudeCode() — sonnet balances
  // capability and speed for most tasks. Switch to claude-opus-4-7 for harder
  // problems, or claude-haiku-4-5-20251001 for speed.
  agent: claudeCode("claude-opus-4-8"),

  // Path to the prompt file. Shell expressions inside are evaluated inside the
  // sandbox at the start of each iteration, so the agent always sees fresh data.
  promptFile: "./.sandcastle/prompt.md",

  // Maximum number of iterations (agent invocations) to run in a session.
  // Each iteration works on a single issue. Increase this to process more issues
  // per run, or set it to 1 for a single-shot mode.
  maxIterations: 5,

  // Branch strategy — merge-to-head creates a temporary branch for the agent
  // to work on, then merges the result back to HEAD when the run completes.
  // This is required when using copyToWorktree, since head mode bind-mounts
  // the host directory directly (no worktree to copy into).
  branchStrategy: { type: "merge-to-head" },

  // NOTE: we deliberately do NOT copyToWorktree node_modules here. pnpm's
  // node_modules is a tree of symlinks into a global content-addressable store,
  // so copying it into the sandbox worktree would break those links. Instead we
  // rely on `pnpm install` in onSandboxReady, which is fast with a warm store.

  // Lifecycle hooks — commands grouped by where they run (host or sandbox).
  hooks: {
    sandbox: {
      // onSandboxReady runs once after the sandbox is initialised and the repo is
      // synced in, before the agent starts. Use it to install dependencies or run
      // any other setup steps your project needs.
      onSandboxReady: [{ command: "pnpm install" }],
    },
  },
});

// Every iteration ends by printing its manual-verification guide wrapped in
// <verify issue="N" title="…"> (see prompt.md §7). Collect them all here and
// hand the user one digest — the per-issue closing comments on GitHub are the
// durable copy; this is the one the user actually sees at the end of the run.
const verifyBlocks = [
  ...result.stdout.matchAll(
    /<verify\s+issue="(\d+)"(?:\s+title="([^"]*)")?(?:\s+(skipped)="true")?\s*>([\s\S]*?)<\/verify>/g,
  ),
].map(([, issue, title, skipped, body]) => ({
  issue,
  title: title ?? "",
  skipped: Boolean(skipped),
  body: body.trim(),
}));

if (verifyBlocks.length > 0) {
  const digest = verifyBlocks
    .map(
      (b) =>
        `# #${b.issue} ${b.title}${b.skipped ? " — SKIPPED" : ""}\n\n${b.body}\n`,
    )
    .join("\n---\n\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const digestPath = `.sandcastle/logs/verify-${stamp}.md`;
  writeFileSync(digestPath, digest);
  console.log(`\n${"=".repeat(72)}\nHOW TO VERIFY THIS RUN (${verifyBlocks.length} issue(s)) — saved to ${digestPath}\n${"=".repeat(72)}\n`);
  console.log(digest);
} else if (result.commits.length > 0) {
  console.log(
    "\n⚠️  Commits landed but no <verify> blocks were found in the agent output — check the closing comments on the issues for the manual-verification guides.",
  );
}

// After the run merges to main: if the agent actually landed work, spin up the
// dev stack on the host (detached) so the merged change is testable, and print
// where to look. The agent itself runs in a throwaway sandbox whose ports never
// reach the host — so this has to happen here, after run() returns. Skip when no
// commits were made (empty issue list / blocked), since there's nothing to test.
if (result.commits.length > 0) {
  console.log(
    `\n${result.commits.length} commit(s) merged to main. Starting the dev stack…`,
  );
  try {
    execSync("docker compose up -d", { stdio: "inherit" });
    console.log(`\n✅ Ready to test:`);
    console.log(`   App:        ${TEST_URL}`);
    console.log(`   Tile-mapper: ${TEST_URL}/tile-mapper.html`);
  } catch {
    console.log(
      `\n⚠️  Couldn't start the stack (is Docker running?). Start it with: docker compose up -d`,
    );
    console.log(`   Then test at ${TEST_URL}`);
  }
} else {
  console.log("\nNo commits this run — nothing to test, skipping the dev stack.");
}

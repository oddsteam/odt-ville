import { execSync } from "node:child_process";
import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

// Where the dev stack serves once it's up (compose.yaml maps frontend 5460:5460).
const TEST_URL = "http://localhost:5460";

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
  maxIterations: 3,

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

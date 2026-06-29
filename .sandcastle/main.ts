import { execFileSync } from "node:child_process";
import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

// Autonomous issue loop. Each invocation lands ONE Sandcastle-labelled issue as
// a pull request for human review — it never pushes to `main` directly.
//
//   pnpm sandcastle      (-> npx tsx .sandcastle/main.ts)
//
// Why this shape (see the loop post-mortem / the closed-but-unmerged incident):
//   * The agent works on a fresh branch cut from origin/main (baseBranch below),
//     so it always sees the real tip — no stale-base diffs that revert newer
//     work, no migration-number collisions from branching off an outdated main.
//   * Work lands on a dedicated `sandcastle/issue-*` branch, NOT merged into
//     whatever branch the host happens to have checked out (the old
//     `merge-to-head` strategy did that, and the work never reached origin).
//   * Landing is a PR with `Closes #N`, opened here on the host after the run.
//     The library has no push/PR support, and we want a human to review before
//     anything reaches `main` (the repo gates `main` behind PR review).

const git = (args: string[], inherit = false): string => {
  // With stdio:"inherit" execFileSync returns null (stdout isn't piped), so only
  // stringify when we actually captured output.
  const out = execFileSync("git", args, inherit ? { stdio: "inherit" } : {});
  return out ? out.toString() : "";
};

// A unique work branch per run, timestamped so it never reuses a stale branch.
const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);
const workBranch = `sandcastle/issue-${stamp}`;

// Make origin/main current on the host BEFORE the run, so the sandbox can cut the
// work branch from the real tip. NamedBranchStrategy.baseBranch trusts the caller
// to have fetched.
git(["fetch", "origin"], true);

const result = await run({
  name: "worker",
  sandbox: docker(),
  agent: claudeCode("claude-opus-4-8"),
  promptFile: "./.sandcastle/prompt.md",

  // One issue per invocation -> one clean PR. Re-run to pick the next issue (a
  // blocked issue only becomes eligible once its blocker's PR has merged).
  maxIterations: 1,

  // Raise the idle timeout: a long, quiet agent turn (deep RGR work) shouldn't be
  // killed at the 600s default mid-task. 30 minutes.
  idleTimeoutSeconds: 1800,

  // Work on a fresh branch cut from origin/main — NOT merge-to-head, which would
  // silently merge into the host's current branch and never reach origin.
  branchStrategy: { type: "branch", branch: workBranch, baseBranch: "origin/main" },

  // pnpm's node_modules is a tree of symlinks into a global store, so we don't
  // copyToWorktree it; a warm `pnpm install` in the sandbox is fast.
  hooks: {
    sandbox: {
      onSandboxReady: [{ command: "pnpm install" }],
    },
  },
});

// Nothing committed -> empty or fully-blocked issue list. Nothing to land.
if (result.commits.length === 0) {
  console.log(
    "\nNo commits this run — nothing to land (empty or fully-blocked issue list).",
  );
  process.exit(0);
}

// Which issue did the agent work? Parse the first #N from the run's commit
// messages (RALPH commits reference the issue, e.g. "… (issue #57)").
const messages = result.commits
  .map((c) => git(["show", "-s", "--format=%B", c.sha]))
  .join("\n");
const issueNumber = messages.match(/#(\d+)/)?.[1];

// Ensure a local branch ref exists pointing at the work, then push and open a PR.
// We do NOT auto-merge — a human reviews and merges, which closes the issue via
// the "Closes #N" body.
try {
  try {
    git(["rev-parse", "--verify", workBranch]);
  } catch {
    git(["branch", workBranch, result.commits[result.commits.length - 1].sha]);
  }
  git(["push", "-u", "origin", workBranch], true);

  const title = issueNumber
    ? execFileSync("gh", ["issue", "view", issueNumber, "--json", "title", "-q", ".title"])
        .toString()
        .trim()
    : `Sandcastle: ${workBranch}`;
  const ref = issueNumber ? `#${issueNumber}` : "";

  const body = [
    issueNumber ? `Closes ${ref}.` : "",
    "",
    "Autonomous Sandcastle run — review before merging.",
    `${result.commits.length} commit(s) on \`${workBranch}\`, branched from origin/main.`,
    "",
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  ].join("\n");

  const prUrl = execFileSync("gh", [
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    workBranch,
    "--title",
    issueNumber ? `${title} (${ref})` : title,
    "--body",
    body,
  ])
    .toString()
    .trim();

  console.log(`\n✅ Opened PR for review: ${prUrl}`);
  console.log(
    `   ${ref ? `Closes ${ref} on merge. ` : ""}Review, then merge to land it on main.`,
  );
} catch (err) {
  console.log(
    `\n⚠️  Work is committed on ${workBranch} but the push/PR step failed.`,
  );
  console.log(
    `   Land it manually:  git push -u origin ${workBranch} && gh pr create --base main --head ${workBranch}`,
  );
  console.log(String(err));
}

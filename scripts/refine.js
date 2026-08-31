// Craft Factory — Thursday refinement pass.
//
// This script does NOT write code or commits — refinement is the human part,
// and that's the whole point of the factory. It posts ONE issue in the factory
// repo containing:
//   1. A concrete hand-refinement checklist for your newest repo(s).
//   2. A rot scan across the whole portfolio (stale repos, thin good-first-issues,
//      missing description/topics).
//   3. Anything waiting on your reply (open PRs / issues from other people).
//
// Because you own the factory repo, creating this issue pings you natively
// (email + mobile) the moment it lands.

const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OWNER = process.env.GH_OWNER;
const FACTORY = process.env.FACTORY_REPO; // e.g. "Bilex95/craft-factory"
const STALE_DAYS = 14;

function gh(args) {
  return execSync(`gh ${args}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function ghJSON(args) {
  return JSON.parse(gh(args));
}

// Create an issue without going through a shell — the body contains backticks
// and quotes that a shell would mangle (command substitution, word splitting).
function createIssue(repo, title, body) {
  return execFileSync(
    "gh",
    ["issue", "create", "--repo", repo, "--title", title, "--body-file", "-"],
    { input: body, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );
}

function manifest() {
  const p = path.join(ROOT, "repos.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function repoView(name) {
  try {
    return ghJSON(
      `repo view ${OWNER}/${name} --json pushedAt,description,repositoryTopics,url`
    );
  } catch (e) {
    return null;
  }
}

function openGoodFirstIssues(name) {
  try {
    return ghJSON(
      `issue list --repo ${OWNER}/${name} --state open --label "good first issue" --json number,title,comments --limit 20`
    );
  } catch (e) {
    return [];
  }
}

// Open PRs from others, or issues whose last comment isn't yours.
function needsReply(name) {
  const items = [];
  try {
    const prs = ghJSON(
      `pr list --repo ${OWNER}/${name} --state open --json number,title,author --limit 20`
    );
    for (const pr of prs) {
      if (pr.author?.login !== OWNER) {
        items.push(
          `🔀 [PR #${pr.number}](https://github.com/${OWNER}/${name}/pull/${pr.number}) — "${pr.title}" (@${pr.author?.login})`
        );
      }
    }
    const issues = ghJSON(
      `issue list --repo ${OWNER}/${name} --state open --json number,title,comments --limit 30`
    );
    for (const is of issues) {
      const last = is.comments?.[is.comments.length - 1];
      if (last && last.author?.login !== OWNER) {
        items.push(
          `💬 [Issue #${is.number}](https://github.com/${OWNER}/${name}/issues/${is.number}) — "${is.title}" (last reply @${last.author?.login})`
        );
      }
    }
  } catch (e) {
    items.push(`⚠️ Could not scan ${name} (${e.message.slice(0, 80)})`);
  }
  return items;
}

function checklist(name, url) {
  return [
    `### 🔨 Hand-refine: [${name}](${url})`,
    "",
    "The scaffold shipped. This is the pass that makes it yours — aim for 2–5 real commits:",
    "",
    "- [ ] Clone it, run it, actually use it once. Note anything that feels off.",
    "- [ ] Fix or improve one real thing you noticed (not a cosmetic tweak).",
    "- [ ] Read the `good first issue` as a contributor would — genuinely doable in under an hour, with enough context? Tighten it.",
    "- [ ] README: confirm setup/run steps work from a clean checkout. Add a screenshot or short clip if it's visual.",
    "- [ ] Add one test, or one edge-case guard, a reviewer would respect.",
    "- [ ] Commit with messages that describe the *why*, not \"update\".",
  ].join("\n");
}

(() => {
  const repos = manifest();
  const today = new Date().toISOString().slice(0, 10);

  if (repos.length === 0) {
    console.log("No repos in the manifest yet — nothing to refine.");
    return;
  }

  // Newest 2 repos get the hand-refinement checklist.
  const newest = repos.slice(-2).reverse();
  const checklistSections = newest.map((r) => {
    const v = repoView(r.name);
    return checklist(r.name, v?.url || `https://github.com/${OWNER}/${r.name}`);
  });

  // Rot scan across the whole portfolio.
  const rot = [];
  for (const r of repos) {
    const v = repoView(r.name);
    if (!v) {
      rot.push(`- ⚠️ **${r.name}** — could not read repo`);
      continue;
    }
    const flags = [];
    if (v.pushedAt && daysSince(v.pushedAt) >= STALE_DAYS) {
      flags.push(`no commits in ${daysSince(v.pushedAt)}d`);
    }
    if (!v.description) flags.push("no description");
    if (!v.repositoryTopics || v.repositoryTopics.length === 0) flags.push("no topics");
    const untouched = openGoodFirstIssues(r.name).filter(
      (i) => (i.comments?.length || 0) === 0
    );
    if (untouched.length > 0) {
      flags.push(`${untouched.length} good-first-issue(s) with no takers`);
    }
    if (flags.length > 0) rot.push(`- **${r.name}** — ${flags.join("; ")}`);
  }

  // Waiting on your reply.
  const waiting = [];
  for (const r of repos) {
    const items = needsReply(r.name);
    if (items.length > 0) {
      waiting.push(`**${r.name}**\n${items.map((i) => `- ${i}`).join("\n")}`);
    }
  }

  const body = [
    `## Refinement pass — ${today}`,
    "",
    `📦 Portfolio size: **${repos.length} repos**`,
    "",
    ...checklistSections,
    "",
    "---",
    "",
    rot.length > 0
      ? `## 🧹 Portfolio rot scan\n\n${rot.join("\n")}`
      : "## 🧹 Portfolio rot scan\n\nEverything looks maintained. 🎉",
    "",
    waiting.length > 0
      ? `## 📨 Waiting on your reply\n\n${waiting.join("\n\n")}`
      : "## 📨 Waiting on your reply\n\nNothing pending.",
    "",
    "_This pass posts a checklist only — it never commits code. That part is yours._",
  ].join("\n");

  createIssue(FACTORY, `🔨 Refinement pass — ${today}`, body);
  console.log("Refinement pass issue posted.");
})();

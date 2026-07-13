// Craft Factory — digest & attention alerts
// Scans every repo in repos.json for open issues/PRs where the latest
// comment is NOT from you, then opens (or updates) an issue in the factory
// repo. Because you own the factory repo, GitHub notifies you natively
// (email + mobile) the moment this issue is created or updated.
//
// Modes:
//   default          -> full weekly digest (new repo + attention list)
//   ATTENTION_ONLY   -> only posts if something needs your response

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OWNER = process.env.GH_OWNER;
const FACTORY = process.env.FACTORY_REPO; // e.g. "Bilex95/craft-factory"
const ATTENTION_ONLY = process.env.ATTENTION_ONLY === "true";

function gh(args) {
  return execSync(`gh ${args}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function ghJSON(args) {
  return JSON.parse(gh(args));
}

function queueCount() {
  const qdir = path.join(ROOT, "templates", "queue");
  if (!fs.existsSync(qdir)) return 0;
  return fs.readdirSync(qdir).filter((f) => f.endsWith(".json")).length;
}

function manifest() {
  const p = path.join(ROOT, "repos.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
}

function needsAttention(repo) {
  const items = [];
  try {
    // Open PRs: any PR from someone else, or where the last comment isn't yours.
    const prs = ghJSON(
      `pr list --repo ${OWNER}/${repo} --state open --json number,title,author,updatedAt --limit 20`
    );
    for (const pr of prs) {
      if (pr.author?.login !== OWNER) {
        items.push({ type: "PR", num: pr.number, title: pr.title, who: pr.author?.login });
      }
    }
    // Open issues with recent comments from others.
    const issues = ghJSON(
      `issue list --repo ${OWNER}/${repo} --state open --json number,title,comments,author --limit 30`
    );
    for (const is of issues) {
      const last = is.comments?.[is.comments.length - 1];
      if (last && last.author?.login !== OWNER) {
        items.push({ type: "issue", num: is.number, title: is.title, who: last.author?.login });
      }
    }
  } catch (e) {
    items.push({ type: "error", title: `Could not scan (${e.message.slice(0, 80)})` });
  }
  return items;
}

function buildReport() {
  const repos = manifest();
  const sections = [];
  let attentionCount = 0;

  for (const r of repos) {
    const items = needsAttention(r.name);
    if (items.length === 0) continue;
    attentionCount += items.length;
    const lines = items.map((i) =>
      i.type === "error"
        ? `- ⚠️ ${i.title}`
        : `- ${i.type === "PR" ? "🔀 PR" : "💬 Issue"} [#${i.num}](https://github.com/${OWNER}/${r.name}/${i.type === "PR" ? "pull" : "issues"}/${i.num}) — "${i.title}" (from @${i.who})`
    );
    sections.push(`### ${r.name}\n${lines.join("\n")}`);
  }

  return { sections, attentionCount, totalRepos: repos.length };
}

(() => {
  const { sections, attentionCount, totalRepos } = buildReport();
  const today = new Date().toISOString().slice(0, 10);

  if (ATTENTION_ONLY) {
    if (attentionCount === 0) {
      console.log("Nothing needs your attention. No alert posted.");
      return;
    }
    const body = [
      `**${attentionCount} item(s) are waiting on your response** across your project repos:`,
      "",
      ...sections,
      "",
      "_Reply, review, or close them when you get a moment — contributors are watching!_",
    ].join("\n");
    gh(
      `issue create --repo ${FACTORY} --title "🔔 ${attentionCount} item(s) need your attention (${today})" --body ${JSON.stringify(body)}`
    );
    console.log("Attention alert posted.");
    return;
  }

  // Queue alert: when 1 or 0 specs remain, open a dedicated issue so GitHub
  // pings you (email + mobile) with clear instructions to restock.
  const remaining = queueCount();
  if (remaining <= 1) {
    const alertBody = [
      remaining === 0
        ? "**Your project queue is EMPTY.** Next week will fall back to the generic template unless you restock."
        : "**Only 1 project spec left in the queue** — after next week it runs dry.",
      "",
      "### How to restock (5 minutes)",
      "1. Open a Claude chat and say: *\"Generate 4 more project specs for my craft-factory queue\"* — paste the contents of `repos.json` so nothing repeats.",
      "2. Save each JSON into `templates/queue/` with the next numbers (e.g. `005-name.json`, `006-name.json`).",
      "3. Commit and push. Done — the next 4 weeks are covered.",
    ].join("\n");
    gh(
      `issue create --repo ${FACTORY} --title "🪣 Project queue is ${remaining === 0 ? "empty" : "almost empty"} — time to restock" --body ${JSON.stringify(alertBody)}`
    );
    console.log("Queue restock alert posted.");
  }

  // Full weekly digest
  const newRepo = fs.existsSync(path.join(ROOT, ".new-repo-name"))
    ? fs.readFileSync(path.join(ROOT, ".new-repo-name"), "utf8").trim()
    : null;

  const body = [
    `## Weekly digest — ${today}`,
    "",
    newRepo
      ? `✅ **New project published:** [${newRepo}](https://github.com/${OWNER}/${newRepo})\n\n**Your job this week (~1 hour):** open it, improve something by hand, push a couple of real commits, and make sure the good-first-issue reads well. That pass is what makes it yours.`
      : "⚠️ **No new project was published this run** — check the workflow logs.",
    "",
    `📦 Portfolio size: **${totalRepos} repos** · 🪣 Queue: **${remaining} spec(s) remaining**`,
    "",
    sections.length > 0
      ? `## Needs your attention (${attentionCount})\n\n${sections.join("\n\n")}`
      : "## Needs your attention\n\nNothing pending — all quiet. 🎉",
  ].join("\n");

  gh(
    `issue create --repo ${FACTORY} --title "📋 Weekly digest — ${today}" --body ${JSON.stringify(body)}`
  );
  console.log("Weekly digest posted.");
})();

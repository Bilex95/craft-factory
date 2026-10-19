// Craft Factory — digest & attention alerts
// Scans every repo in repos.json for open issues/PRs where the latest
// comment is NOT from you, then opens (or updates) an issue in the factory
// repo. Because you own the factory repo, GitHub notifies you natively
// (email + mobile) the moment this issue is created or updated.
//
// Modes:
//   default          -> full digest for a new-project run (new repo + attention list)
//   ATTENTION_ONLY   -> only posts if something needs your response
//
// Housekeeping (see lib/issues.js): a new digest closes the previous open
// digest once it has been posted, and restock alerts are commented on rather
// than duplicated, then closed when the queue is genuinely replenished.

const fs = require("fs");
const path = require("path");
const ghIO = require("./lib/gh");
const { readQueue } = require("./lib/spec");
const { PREFIX, restockAction, supersede } = require("./lib/issues");

const ROOT = path.join(__dirname, "..");

// Link to a user's profile WITHOUT an @mention. An @mention in the digest
// notifies that contributor, who then reads your "Your job now" notes as
// tasks assigned to them. A plain profile link is still clickable but silent.
// Bot accounts ("dependabot[bot]") live under /apps/<name>, not /<login>.
function quietUser(login) {
  if (!login) return "unknown";
  const bot = login.match(/^(.+)\[bot\]$/);
  const url = bot ? `https://github.com/apps/${bot[1]}` : `https://github.com/${login}`;
  return `[${login}](${url})`;
}

// Defuse @mentions inside text contributors wrote (PR/issue titles). A
// zero-width space after "@" keeps it readable but stops GitHub notifying.
function quiet(text) {
  return String(text ?? "").replace(/(?<!\w)@(?=[A-Za-z0-9-])/g, "@\u200B");
}

function manifest(root) {
  const p = path.join(root, "repos.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
}

// Only specs that would actually be published count: invalid or duplicate
// specs sitting in the queue don't stop it from being "empty".
function queueCount(root, repos) {
  return readQueue(path.join(root, "templates", "queue"), repos).filter((q) => q.ok).length;
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : null;
}

function needsAttention(io, owner, repo) {
  const items = [];
  try {
    // Open PRs: any PR from someone else, or where the last comment isn't yours.
    const prs = io.ghJSON(
      `pr list --repo ${owner}/${repo} --state open --json number,title,author,updatedAt --limit 20`
    );
    for (const pr of prs) {
      if (pr.author?.login !== owner) {
        items.push({ type: "PR", num: pr.number, title: pr.title, who: pr.author?.login });
      }
    }
    // Open issues with recent comments from others.
    const issues = io.ghJSON(
      `issue list --repo ${owner}/${repo} --state open --json number,title,comments,author --limit 30`
    );
    for (const is of issues) {
      const last = is.comments?.[is.comments.length - 1];
      if (last && last.author?.login !== owner) {
        items.push({ type: "issue", num: is.number, title: is.title, who: last.author?.login });
      }
    }
  } catch (e) {
    items.push({ type: "error", title: `Could not scan (${e.message.slice(0, 80)})` });
  }
  return items;
}

function buildReport(io, owner, repos) {
  const OWNER = owner; // keeps the notification-safe line below unchanged from PR #39
  const sections = [];
  let attentionCount = 0;

  for (const r of repos) {
    const items = needsAttention(io, owner, r.name);
    if (items.length === 0) continue;
    attentionCount += items.length;
    const lines = items.map((i) =>
      i.type === "error"
        ? `- ⚠️ ${i.title}`
        : `- ${i.type === "PR" ? "🔀 PR" : "💬 Issue"} [#${i.num}](https://github.com/${OWNER}/${r.name}/${i.type === "PR" ? "pull" : "issues"}/${i.num}) — "${quiet(i.title)}" (from ${quietUser(i.who)})`
    );
    sections.push(`### ${r.name}\n${lines.join("\n")}`);
  }

  return { sections, attentionCount, totalRepos: repos.length };
}

function restockBody(remaining, factory) {
  return [
    remaining === 0
      ? "**Your project queue is EMPTY.** New-project runs will try the Claude API (if `ANTHROPIC_API_KEY` has credit); if that fails, nothing is published that week — the factory never republishes a fallback template."
      : `**Only ${remaining} valid project spec(s) left in the queue.** Restock before it runs dry.`,
    "",
    "### How to restock",
    "1. Open a Claude chat, paste [`templates/SPEC.md`](https://github.com/" +
      factory +
      "/blob/main/templates/SPEC.md) and the contents of `repos.json`, and ask for 6 project specs that follow it — each solving a real problem for a named group of people at work.",
    "2. Save each JSON into `templates/queue/` with the next numbers so they run in order.",
    "3. Run `node --test` locally — the queue test checks every spec against the quality gate and runs each project's own tests.",
    "4. Commit and push. This alert closes itself once more than 3 valid specs are queued.",
  ].join("\n");
}

// Create, comment on, or close the restock alert. Never opens a second one.
function handleRestock(io, factory, remaining, today) {
  const action = restockAction(remaining, io.listOpenIssues(factory));
  if (action.type === "create") {
    io.createIssue(
      factory,
      `${PREFIX.restock} is ${remaining === 0 ? "empty" : "running low"} — time to restock`,
      restockBody(remaining, factory)
    );
    console.log("Queue restock alert posted.");
  } else if (action.type === "comment") {
    io.commentIssue(factory, action.issue.number, `Still ${remaining} valid spec(s) in the queue as of ${today}.`);
    console.log(`Restock alert #${action.issue.number} updated.`);
  } else if (action.type === "close") {
    io.closeIssue(factory, action.issue.number, `Queue replenished: ${remaining} valid spec(s) as of ${today}.`);
    console.log(`Restock alert #${action.issue.number} closed — queue replenished.`);
  }
  return action;
}

function publishedLine(owner, newRepo, skipReason) {
  if (newRepo) {
    return `✅ **New project published:** [${newRepo}](https://github.com/${owner}/${newRepo})\n\n**Your job now (~1 hour):** open it, improve something by hand, push a couple of real commits, and make sure the good-first-issue reads well. That pass is what makes it yours — Thursday's refinement issue will remind you.`;
  }
  if (skipReason) {
    return `⏸️ **No new project this run.** ${quiet(skipReason)}\n\nNothing was published: the factory only ships specs that pass the quality gate, and never republishes a fallback template. Restock the queue (see the 🪣 alert) or restore API access.`;
  }
  return "⚠️ **No new project was published this run** — check the workflow logs.";
}

function main({
  io = ghIO,
  root = ROOT,
  owner = process.env.GH_OWNER,
  factory = process.env.FACTORY_REPO, // e.g. "Bilex95/craft-factory"
  attentionOnly = process.env.ATTENTION_ONLY === "true",
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const repos = manifest(root);
  const { sections, attentionCount, totalRepos } = buildReport(io, owner, repos);

  if (attentionOnly) {
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
    io.createIssue(factory, `🔔 ${attentionCount} item(s) need your attention (${today})`, body);
    console.log("Attention alert posted.");
    return;
  }

  // Queue alert: when 3 or fewer valid specs remain, keep ONE open issue so
  // GitHub pings you (email + mobile) with clear instructions to restock.
  // Restock housekeeping must never cost you the digest itself: a failed gh
  // call here is logged as a workflow warning and the digest still posts.
  const remaining = queueCount(root, repos);
  try {
    handleRestock(io, factory, remaining, today);
  } catch (e) {
    console.warn(
      `::warning::Restock alert handling failed (${remaining} valid spec(s) queued); the digest will still be posted. ${String(e && e.message).slice(0, 300)}`
    );
  }

  // Full digest for a new-project run. generate.js leaves either
  // .new-repo-name (published) or .skip-reason (nothing published, and why).
  const newRepo = readIfExists(path.join(root, ".new-repo-name"));
  const skipReason = newRepo ? null : readIfExists(path.join(root, ".skip-reason"));

  const body = [
    `## Project digest — ${today}`,
    "",
    publishedLine(owner, newRepo, skipReason),
    "",
    `📦 Portfolio size: **${totalRepos} repos** · 🪣 Queue: **${remaining} valid spec(s) remaining**`,
    "",
    sections.length > 0
      ? `## Needs your attention (${attentionCount})\n\n${sections.join("\n\n")}`
      : "## Needs your attention\n\nNothing pending — all quiet. 🎉",
  ].join("\n");

  const url = io.createIssue(factory, `${PREFIX.digest} — ${today}`, body);
  console.log("Project digest posted.");
  supersede(io, factory, PREFIX.digest, url);
}

module.exports = { quiet, quietUser, buildReport, restockBody, publishedLine, main };

if (require.main === module) main();

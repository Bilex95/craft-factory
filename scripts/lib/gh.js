// The only place the report scripts talk to GitHub. digest.js and refine.js
// receive this object as `io`, so tests can pass a fake and never touch GitHub.

const { execSync, execFileSync } = require("child_process");

function gh(args) {
  return execSync(`gh ${args}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function ghJSON(args) {
  return JSON.parse(gh(args));
}

// Issue text goes through execFileSync + stdin, never a shell — bodies contain
// backticks and quotes that a shell would mangle (command substitution, word
// splitting). Returns the new issue's URL.
function createIssue(repo, title, body) {
  return execFileSync(
    "gh",
    ["issue", "create", "--repo", repo, "--title", title, "--body-file", "-"],
    { input: body, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

function commentIssue(repo, number, body) {
  execFileSync(
    "gh",
    ["issue", "comment", String(number), "--repo", repo, "--body-file", "-"],
    { input: body, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );
}

function closeIssue(repo, number, comment) {
  execFileSync(
    "gh",
    ["issue", "close", String(number), "--repo", repo, "--comment", comment],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );
}

const PER_PAGE = 100; // GitHub's maximum page size
const MAX_PAGES = 20; // hard bound: 2,000 open issues

// One page of open issues from the REST API (read-only GET).
function fetchIssuePage(repo, page) {
  const out = execFileSync(
    "gh",
    ["api", "--method", "GET", `repos/${repo}/issues?state=open&per_page=${PER_PAGE}&page=${page}`],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );
  return JSON.parse(out);
}

// All open issues as [{ number, title }], read page by page until a short
// page. Pull requests (which this endpoint also returns) are dropped. Bounded
// at MAX_PAGES; if that is ever reached a warning is logged rather than
// silently missing issues.
function listOpenIssues(repo, fetchPage = fetchIssuePage) {
  const issues = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = fetchPage(repo, page);
    if (!Array.isArray(batch)) throw new Error(`Unexpected issues response for ${repo} page ${page}`);
    for (const i of batch) if (!i.pull_request) issues.push({ number: i.number, title: i.title });
    if (batch.length < PER_PAGE) return issues;
  }
  console.warn(`::warning::${repo} has more than ${MAX_PAGES * PER_PAGE} open issues and pull requests; only the first ${MAX_PAGES} pages were read.`);
  return issues;
}

module.exports = { gh, ghJSON, createIssue, commentIssue, closeIssue, listOpenIssues, PER_PAGE, MAX_PAGES };

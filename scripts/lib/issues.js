// Issue housekeeping shared by digest.js and refine.js.
//
// Rules (agreed for craft-factory):
// - A new report supersedes ONLY the single most recent open report of the
//   same kind, and only after the new one was created successfully.
// - A restock alert stays open until the queue is genuinely replenished; while
//   the queue is low the open alert gets a status comment instead of a new
//   issue. Replenishment closes only the most recent alert.
// - Issues up to and including #HISTORICAL_CUTOFF predate these rules. They
//   are invisible to all of the above — never closed or commented on by
//   automation — and are left for a manual, reviewed closure plan.

const HISTORICAL_CUTOFF = 43;

const PREFIX = {
  digest: "📋 Project digest",
  refine: "🔨 Refinement pass",
  restock: "🪣 Project queue",
};

const LOW_QUEUE = 3; // at or below this many valid specs, the queue is "low"

function issueNumber(url) {
  const m = String(url || "").trim().match(/\/issues\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

// Open issues whose title starts with `prefix`, newest first. Historical
// issues (#HISTORICAL_CUTOFF and below) are never returned, so nothing
// downstream can close or comment on them.
function openWithPrefix(issues, prefix) {
  return (issues || [])
    .filter((i) => i.number > HISTORICAL_CUTOFF)
    .filter((i) => typeof i.title === "string" && i.title.startsWith(prefix))
    .sort((a, b) => b.number - a.number);
}

// The one report the new issue replaces: the newest open one of the same kind
// that is older than the new issue. Never more than one.
function previousReport(issues, prefix, newNumber) {
  return openWithPrefix(issues, prefix).find((i) => i.number < newNumber) || null;
}

// What to do about restock alerts given how many valid specs remain.
function restockAction(remaining, openIssues) {
  const newest = openWithPrefix(openIssues, PREFIX.restock)[0] || null;
  if (remaining <= LOW_QUEUE) return newest ? { type: "comment", issue: newest } : { type: "create" };
  return newest ? { type: "close", issue: newest } : { type: "none" };
}

// Close the report the new one replaces. Runs only after creation succeeded,
// so a failed post never leaves you with no open report. Failure here is
// logged, not fatal: the new report is already up.
function supersede(io, repo, prefix, newUrl) {
  const newNumber = issueNumber(newUrl);
  if (!newNumber) {
    console.warn(`::warning::Could not read the new issue number from "${String(newUrl).trim()}"; nothing superseded.`);
    return null;
  }
  try {
    const prev = previousReport(io.listOpenIssues(repo), prefix, newNumber);
    if (!prev) return null;
    io.closeIssue(repo, prev.number, `Superseded by #${newNumber}.`);
    console.log(`Closed #${prev.number} (superseded by #${newNumber}).`);
    return prev.number;
  } catch (e) {
    console.warn(`::warning::Could not supersede the previous report: ${e.message.slice(0, 200)}`);
    return null;
  }
}

module.exports = {
  PREFIX,
  LOW_QUEUE,
  HISTORICAL_CUTOFF,
  issueNumber,
  openWithPrefix,
  previousReport,
  restockAction,
  supersede,
};

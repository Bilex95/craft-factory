// Project spec quality gate + near-duplicate detection.
//
// Every project the factory publishes — from the queue or from the API — must
// pass validateSpec() and must not be a near-duplicate of anything already in
// repos.json. A spec that fails is never published; it is skipped with a
// reason. This is what stops a fallback template from being republished
// under a numeric suffix (fair-split-12, -13, -14...).

const fs = require("fs");
const path = require("path");
const { AREA_KEYS } = require("./areas");

const SCAFFOLD_LINE =
  "Scaffolded by an automated weekly pipeline, then refined by hand — see the factory repo for how it works.";

// README must explain the problem, who it helps, how to try it, how we know
// it works, and how to contribute. Matched as "## <heading>" lines.
const README_SECTIONS = [
  { label: "The problem", re: /^##\s+the problem\b/im },
  { label: "Who it's for", re: /^##\s+who it'?s for\b/im },
  { label: "Try it", re: /^##\s+try it\b/im },
  { label: "Acceptance criteria", re: /^##\s+acceptance criteria\b/im },
  { label: "Contribute", re: /^##\s+contribute\b/im },
];

const TEST_FILE = /(^|\/)(test|tests|__tests__)\/|\.test\.[cm]?js$|\.spec\.[cm]?js$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONSIDERATIONS = ["privacy", "security", "accessibility", "oversight"];

const isText = (v) => typeof v === "string" && v.trim().length > 0;

function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { ok: false, errors: ["spec is not a JSON object"] };
  }

  for (const k of ["repoName", "description", "area", "audience", "problem", "outcome", "v1", "demo"]) {
    if (!isText(spec[k])) errors.push(`missing ${k}`);
  }
  if (isText(spec.repoName)) {
    if (!KEBAB.test(spec.repoName) || spec.repoName.length > 50) {
      errors.push("repoName must be kebab-case, max 50 chars");
    }
    if (/-\d+$/.test(spec.repoName)) {
      errors.push("repoName must not end in a number (that is how duplicates were disguised)");
    }
  }
  if (isText(spec.description) && spec.description.length > 100) {
    errors.push("description is over 100 characters");
  }
  if (isText(spec.area) && !AREA_KEYS.includes(spec.area)) {
    errors.push(`area must be one of: ${AREA_KEYS.join(", ")}`);
  }

  const list = (k, min, max) => {
    const v = spec[k];
    if (!Array.isArray(v) || !v.every(isText)) return errors.push(`${k} must be a list of strings`);
    if (v.length < min) errors.push(`${k} needs at least ${min}`);
    if (max && v.length > max) errors.push(`${k} allows at most ${max}`);
  };
  list("topics", 3, 8);
  list("acceptanceCriteria", 3);
  list("nextSteps", 2);

  const c = spec.considerations;
  if (!c || typeof c !== "object") {
    errors.push("missing considerations");
  } else {
    for (const k of CONSIDERATIONS) {
      if (!isText(c[k])) errors.push(`considerations.${k} is required (say "not applicable" and why)`);
    }
  }

  if (!spec.issue || !isText(spec.issue.title) || !isText(spec.issue.body)) {
    errors.push("missing good-first-issue (issue.title and issue.body)");
  }

  const files = spec.files;
  if (!Array.isArray(files) || files.length < 3 || files.length > 6) {
    errors.push("files must contain 3 to 6 files");
  } else {
    const seen = new Set();
    for (const f of files) {
      const p = f && f.path;
      if (!isText(p) || !isText(f.content)) {
        errors.push("every file needs a path and non-empty content");
        continue;
      }
      if (path.isAbsolute(p) || p.split(/[\\/]/).includes("..")) errors.push(`unsafe file path: ${p}`);
      if (seen.has(p)) errors.push(`duplicate file path: ${p}`);
      seen.add(p);
    }
    const readme = files.find((f) => f && f.path === "README.md");
    if (!readme || !isText(readme.content)) {
      errors.push("README.md is required");
    } else {
      for (const s of README_SECTIONS) {
        if (!s.re.test(readme.content)) errors.push(`README is missing a "## ${s.label}" section`);
      }
      if (!readme.content.includes(SCAFFOLD_LINE)) errors.push("README is missing the scaffold line");
    }
    if (!files.some((f) => f && isText(f.path) && TEST_FILE.test(f.path))) {
      errors.push("at least one test file is required (test/…, *.test.js or *.spec.js)");
    }
  }

  return { ok: errors.length === 0, errors };
}

// --- near-duplicate detection ------------------------------------------------

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have in into is it its of on or so than that the their them then there this to up was when where which who with without your you any all one more most no not only out over same very what can".split(
    " "
  )
);

// "fair-split-14" and "fair-split" are the same project.
function baseName(name) {
  return String(name || "").toLowerCase().replace(/(-\d+)+$/, "");
}

function tokens(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

const SIMILARITY_LIMIT = 0.5;

// Returns { name, reason } for the first existing project this spec repeats,
// or null. `existing` items need { name, description }.
function findDuplicate(spec, existing) {
  const name = baseName(spec.repoName);
  const mine = tokens(spec.description);
  for (const r of existing || []) {
    if (name && baseName(r.name) === name) {
      return { name: r.name, reason: `same name as ${r.name}` };
    }
    const score = jaccard(mine, tokens(r.description));
    if (score >= SIMILARITY_LIMIT) {
      return { name: r.name, reason: `description ${Math.round(score * 100)}% similar to ${r.name}` };
    }
  }
  return null;
}

// Full check used everywhere a spec is about to be trusted.
function checkSpec(spec, existing) {
  const { errors } = validateSpec(spec);
  if (errors.length === 0) {
    const dup = findDuplicate(spec, existing);
    if (dup) errors.push(`near-duplicate: ${dup.reason}`);
  }
  return { ok: errors.length === 0, errors };
}

// --- queue ---------------------------------------------------------------------

// Every *.json in the queue dir, oldest (lowest number) first, with its verdict.
// Specs are also checked against the ones queued ahead of them, so two queued
// near-duplicates can't both ship.
function readQueue(qdir, manifest) {
  if (!fs.existsSync(qdir)) return [];
  const seen = [...(manifest || [])];
  return fs
    .readdirSync(qdir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      let spec = null;
      try {
        spec = JSON.parse(fs.readFileSync(path.join(qdir, file), "utf8"));
      } catch (e) {
        return { file, spec: null, ok: false, errors: [`invalid JSON: ${e.message}`] };
      }
      const verdict = checkSpec(spec, seen);
      if (verdict.ok) seen.push({ name: spec.repoName, description: spec.description });
      return { file, spec, ...verdict };
    });
}

module.exports = {
  SCAFFOLD_LINE,
  README_SECTIONS,
  validateSpec,
  findDuplicate,
  checkSpec,
  readQueue,
  baseName,
  tokens,
  jaccard,
  SIMILARITY_LIMIT,
};

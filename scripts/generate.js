// Craft Factory — weekly project generator
// Picks one small project that solves a REAL problem for a named group of
// people at work, with a deliberately varied technical approach each week.
//
// Source order: the hand-curated queue (templates/queue/), then the Claude
// API. Every spec must pass the quality gate and duplicate check in
// lib/spec.js. If nothing passes — empty queue and no API — NOTHING is
// published: the run writes .skip-reason for the digest to report and sets
// the `published=false` step output. There is no fallback template.

const fs = require("fs");
const path = require("path");
const { AREAS } = require("./lib/areas");
const { SCAFFOLD_LINE, README_SECTIONS, checkSpec, readQueue } = require("./lib/spec");

const ROOT = path.join(__dirname, "..");

// Approach variation: one dimension per week so the repos don't feel stamped
// from one mold. This varies architecture/technique — the projects remain
// honestly generated-then-refined, per the repo's own README.
const APPROACHES = [
  "Use BEM naming and a single CSS file.",
  "Use CSS custom properties as a token system with light/dark support.",
  "Structure JS as small pure functions with a tiny render loop (no classes).",
  "Structure JS around one class per concern.",
  "Use event delegation on a single root listener.",
  "Use <template> elements and cloneNode for rendering.",
  "Use CSS Grid exclusively for layout (no flexbox).",
  "Go dependency-free and comment sparsely; let naming carry the meaning.",
  "Comment generously in a tutorial tone, as if teaching a junior.",
  "Use progressive enhancement: the page must work without JS, then JS improves it.",
];

function paths(root) {
  return {
    out: path.join(root, ".staging"), // project staged here, published by publish.sh
    manifest: path.join(root, "repos.json"),
    queue: path.join(root, "templates", "queue"),
    newName: path.join(root, ".new-repo-name"),
    meta: path.join(root, ".new-repo-meta.json"),
    skip: path.join(root, ".skip-reason"),
  };
}

function readManifest(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
}

// The area that has gone longest without a project (never-covered areas
// first, ties broken by AREAS order). Manifest entries without an `area`
// (older, personal-use projects) don't count towards any area.
function pickArea(manifest, areas = AREAS) {
  const last = new Map(areas.map((a) => [a.key, -1]));
  manifest.forEach((r, i) => {
    if (last.has(r.area)) last.set(r.area, i);
  });
  return areas.reduce((best, a) => (last.get(a.key) < last.get(best.key) ? a : best));
}

// Queue mode: specs written by hand (see templates/SPEC.md), used oldest
// first. Only a spec that passes the gate is consumed; invalid ones stay put
// with a warning so you can fix them. Zero API cost.
function popQueue(qdir, manifest) {
  const entries = readQueue(qdir, manifest);
  for (const e of entries.filter((q) => !q.ok)) {
    console.log(`::warning::Skipping queue spec ${e.file}: ${e.errors.join("; ")}`);
  }
  const pick = entries.find((q) => q.ok);
  if (!pick) return null;
  fs.unlinkSync(path.join(qdir, pick.file)); // consumed; the manifest commit records the removal
  const remaining = entries.filter((q) => q.ok).length - 1;
  console.log(`Queue: using ${pick.file} (${remaining} valid spec(s) remaining).`);
  if (remaining <= 3) {
    console.log("::warning::Project queue is running low — restock it (see templates/SPEC.md).");
  }
  return pick;
}

function buildPrompt(area, approach, pastRepos) {
  return `You are generating this week's project for a public GitHub portfolio of small projects that make people's working lives better. Visitors include recruiters, hiring managers and open-source contributors.

Problem area for this run: ${area.label}
People who have these problems: ${area.audience}
Area brief: ${area.hint}

Selection rules — the spec is rejected automatically if it breaks them:
1. Start from ONE specific, real workplace problem that the people above actually hit. Name who has it and what it costs them (time, errors, stress, risk).
2. The outcome must be useful and demonstrable: someone can try it in under 5 minutes with the included sample input and see the problem solved. Not a technology showcase.
3. Scope a first version (v1) that is complete on its own, and list at least 2 realistic next steps.
4. Do NOT repeat any existing project's problem or name (list below). Renaming or numbering an existing idea counts as repeating it.
5. Include at least 3 acceptance criteria that a reviewer can check, and at least one automated test that runs with plain "node --test" (node:test + node:assert, no dependencies).
6. State privacy, security, accessibility and human-oversight considerations (write "not applicable" plus the reason when one doesn't apply). Never use real personal data in examples. Anything that acts automatically needs a human approval step.
7. The demo must work offline, with no paid APIs and no secrets.

Technical approach constraint (apply it where it fits the deliverable; it keeps the portfolio varied):
${approach}

Existing repos (do NOT repeat these problems or names):
${pastRepos.map((r) => `- ${r.name}${r.area ? ` [${r.area}]` : ""}: ${r.description}`).join("\n") || "(none yet)"}

Files: 3 to 6 files, each complete and working as-is. Plain JavaScript only, no TypeScript, no build step, no runtime dependencies.
Repo name: short, memorable, kebab-case, describes the solution, must not end in a number.
README.md must contain these exact "## " headings: ${README_SECTIONS.map((s) => `"${s.label}"`).join(", ")}, plus "How it's built" and "Limits and safety". Include this exact line near the bottom: "${SCAFFOLD_LINE}"
One "good first issue": specific, under an hour of work, friendly.
A one-line repo description (max 100 chars) and 4-6 topic tags.

Respond ONLY with valid JSON, no markdown fences:
{
  "repoName": "kebab-case-name",
  "description": "one-line repo description",
  "area": "${area.key}",
  "audience": "who has this problem",
  "problem": "the real problem and what it costs them",
  "outcome": "what is better after using this",
  "v1": "what this first version does and deliberately does not do",
  "nextSteps": ["...", "..."],
  "acceptanceCriteria": ["...", "...", "..."],
  "demo": "exact steps to see it working with the sample input",
  "considerations": { "privacy": "...", "security": "...", "accessibility": "...", "oversight": "..." },
  "topics": ["tag1", "tag2", "tag3", "tag4"],
  "files": [ { "path": "README.md", "content": "..." } ],
  "issue": { "title": "...", "body": "..." }
}`;
}

async function callClaude(area, approach, pastRepos, apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 12000,
      messages: [{ role: "user", content: buildPrompt(area, approach, pastRepos) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// Short, human reason for the digest. Raw API errors can be long JSON.
function apiFailureReason(message) {
  if (/credit balance/i.test(message)) return "the Claude API account has no credit";
  if (/not set/i.test(message)) return "ANTHROPIC_API_KEY is not set";
  return `the Claude API call failed (${message.slice(0, 120)})`;
}

// Returns { project, source } or { skip: reason }. Never invents a fallback.
async function chooseProject({ manifest, qdir, area, approach, generate }) {
  const queued = popQueue(qdir, manifest);
  if (queued) return { project: queued.spec, source: `queue (${queued.file})` };

  let spec;
  try {
    spec = await generate(area, approach, manifest);
  } catch (e) {
    return { skip: `The queue has no valid specs and ${apiFailureReason(e.message)}.` };
  }
  const verdict = checkSpec(spec, manifest);
  if (!verdict.ok) {
    return {
      skip: `The queue has no valid specs and the API's spec failed the quality gate: ${verdict.errors.slice(0, 3).join("; ")}.`,
    };
  }
  return { project: spec, source: "Claude API" };
}

function stage(project, root = ROOT) {
  const p = paths(root);
  fs.rmSync(p.out, { recursive: true, force: true });
  fs.mkdirSync(p.out, { recursive: true });

  const name = slugify(project.repoName);
  const dir = path.join(p.out, name);
  fs.mkdirSync(dir);

  for (const f of project.files) {
    const safe = path.normalize(f.path).replace(/^(\.\.(\/|\\|$))+/, "");
    const dest = path.join(dir, safe);
    if (!dest.startsWith(dir)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.content, "utf8");
  }

  fs.writeFileSync(p.newName, name, "utf8");
  fs.writeFileSync(
    p.meta,
    JSON.stringify(
      {
        name,
        description: project.description || "",
        topics: project.topics || [],
        issue: project.issue || null,
      },
      null,
      2
    ),
    "utf8"
  );

  // Append to manifest now; the workflow commits it after publish.sh succeeds.
  const manifest = readManifest(p.manifest);
  manifest.push({
    name,
    description: project.description || "",
    area: project.area,
    createdAt: new Date().toISOString().slice(0, 10),
  });
  fs.writeFileSync(p.manifest, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Staged: ${name} (${project.files.length} files)`);
}

function setOutput(env, key, value) {
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main({ root = ROOT, env = process.env, generate = callClaude } = {}) {
  const p = paths(root);
  // Clear markers from any earlier local run so the digest can't misreport.
  for (const f of [p.newName, p.meta, p.skip, p.out]) fs.rmSync(f, { recursive: true, force: true });

  const pastRepos = readManifest(p.manifest);
  const area = pickArea(pastRepos);
  const approach = APPROACHES[pastRepos.length % APPROACHES.length];

  console.log(`Project #${pastRepos.length + 1} — area: ${area.label}`);
  console.log(`Approach: ${approach}`);

  const result = await chooseProject({ manifest: pastRepos, qdir: p.queue, area, approach, generate });
  if (result.skip) {
    fs.writeFileSync(p.skip, result.skip, "utf8");
    console.log(`::warning::No project published this run. ${result.skip}`);
    setOutput(env, "published", "false");
    return result;
  }

  console.log(`Source: ${result.source}`);
  stage(result.project, root);
  setOutput(env, "published", "true");
  return result;
}

module.exports = { APPROACHES, pickArea, popQueue, buildPrompt, apiFailureReason, chooseProject, stage, main };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

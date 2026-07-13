// Craft Factory — weekly project generator
// Generates one small project that solves a REAL everyday problem,
// with a deliberately varied technical approach each week.
// Falls back to a bundled template if the API is unavailable.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".staging"); // project staged here, published by publish.sh
const MANIFEST = path.join(ROOT, "repos.json");

// Rotation keeps breadth across your skill areas; the model picks the
// concrete real-world problem within each lane.
const LANES = [
  { key: "ui-tool",       label: "UI micro-tool",        hint: "A small in-browser tool that solves a real everyday annoyance (splitting bills fairly, converting recipe quantities, timing meeting costs, comparing data plans). Vanilla HTML/CSS/JS, single page, genuinely usable." },
  { key: "form-ux",       label: "Form & validation UX", hint: "A realistic form problem done right (phone/address validation for a specific country, multi-step checkout, password UX, error recovery). Focus on inline validation and accessibility." },
  { key: "playwright",    label: "Playwright suite",     hint: "A realistic mini web page (login, cart, booking widget) PLUS a Playwright test suite that would catch real regressions. Include one deliberately failing test as a contributor exercise." },
  { key: "cypress",       label: "Cypress suite",        hint: "A realistic mini web page PLUS a Cypress suite: intercepts, custom commands, flake-resistant selectors. Include one deliberately failing test as a contributor exercise." },
  { key: "api-testing",   label: "API testing",          hint: "A test suite (plain JS, node:test or Playwright API mode) against a real public API solving a real verification need: schema drift detection, rate-limit behavior, error contract checks." },
  { key: "accessibility", label: "Accessibility retrofit", hint: "Take a common real-world bad pattern (inaccessible modal, div-button, keyboard-trap carousel) and ship both the broken version and the fixed version side by side, with an AUDIT.md explaining every fix." },
  { key: "automation",    label: "Workflow automation",  hint: "A small Node script or n8n-style workflow spec solving a real repetitive task: renaming design exports, generating alt-text checklists from HTML, converting CSV client lists to clean JSON." },
];

// Approach variation: one dimension per week so the 52 repos don't feel stamped
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

function isoWeek() {
  const d = new Date();
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
}

function readManifest() {
  if (!fs.existsSync(MANIFEST)) return [];
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
}


// Queue mode: if templates/queue/ has specs (generated via Claude.ai chat and
// committed by hand), use the oldest one and delete it. Zero API cost.
function popQueue() {
  const qdir = path.join(ROOT, "templates", "queue");
  if (!fs.existsSync(qdir)) return null;
  const files = fs.readdirSync(qdir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) return null;
  const file = path.join(qdir, files[0]);
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.unlinkSync(file); // consumed; the manifest commit records the removal
  console.log(`Queue: using ${files[0]} (${files.length - 1} spec(s) remaining).`);
  if (files.length - 1 <= 1) {
    console.log("::warning::Project queue is nearly empty — top it up via Claude chat.");
  }
  return project;
}

async function callClaude(lane, approach, pastRepos) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = `You are generating this week's project for a public GitHub portfolio of small, genuinely useful projects. Each project SOLVES A REAL EVERYDAY PROBLEM — no abstract demos, no toy katas. Visitors include recruiters and open-source contributors.

This week's lane: ${lane.label}
Lane brief: ${lane.hint}

Technical approach constraint for this week (follow it, it keeps the portfolio varied):
${approach}

Existing repos (do NOT repeat these problems or names):
${pastRepos.map((r) => `- ${r.name}: ${r.description}`).join("\n") || "(none yet)"}

Requirements:
- Pick ONE specific, relatable real-world problem and solve it properly.
- 3 to 6 files, each complete and working as-is. Plain JavaScript only, no TypeScript, no build step. For test projects, include exact npm setup commands in the README.
- Repo name: short, memorable, kebab-case, describes the solution (e.g. "fair-split", "meeting-meter").
- README.md must include: the real problem, the solution, how to use/run it, a short "How it's built" note, and a "Contribute" section with 2-3 concrete improvement ideas.
- Include this exact line near the bottom of the README: "Scaffolded by an automated weekly pipeline, then refined by hand — see the factory repo for how it works."
- One "good first issue": specific, under an hour of work, friendly.
- A one-line repo description (max 100 chars) and 4-6 topic tags.

Respond ONLY with valid JSON, no markdown fences:
{
  "repoName": "kebab-case-name",
  "description": "one-line repo description",
  "topics": ["tag1", "tag2"],
  "files": [ { "path": "README.md", "content": "..." } ],
  "issue": { "title": "...", "body": "..." }
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 12000,
      messages: [{ role: "user", content: prompt }],
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

function loadFallback(lane, pastRepos) {
  const specific = path.join(ROOT, "templates", `${lane.key}.json`);
  const file = fs.existsSync(specific) ? specific : path.join(ROOT, "templates", "generic.json");
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  // Avoid name collisions if the fallback has been used before.
  if (pastRepos.some((r) => r.name === project.repoName)) {
    project.repoName = `${project.repoName}-w${isoWeek()}`;
  }
  return project;
}

function stage(project) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const name = slugify(project.repoName);
  const dir = path.join(OUT_DIR, name);
  fs.mkdirSync(dir);

  for (const f of project.files) {
    const safe = path.normalize(f.path).replace(/^(\.\.(\/|\\|$))+/, "");
    const dest = path.join(dir, safe);
    if (!dest.startsWith(dir)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.content, "utf8");
  }

  fs.writeFileSync(path.join(ROOT, ".new-repo-name"), name, "utf8");
  fs.writeFileSync(
    path.join(ROOT, ".new-repo-meta.json"),
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

  // Append to manifest now; publish.sh pushes it with the factory commit.
  const manifest = readManifest();
  manifest.push({
    name,
    description: project.description || "",
    createdAt: new Date().toISOString().slice(0, 10),
  });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Staged: ${name} (${project.files.length} files)`);
}

(async () => {
  const week = isoWeek();
  const lane = LANES[week % LANES.length];
  const approach = APPROACHES[week % APPROACHES.length];
  const pastRepos = readManifest();

  console.log(`Week ${week} — lane: ${lane.label}`);
  console.log(`Approach: ${approach}`);

  let project = popQueue();
  if (!project) {
    try {
      project = await callClaude(lane, approach, pastRepos);
      console.log("Generated via Claude API.");
    } catch (err) {
      console.warn(`API generation failed (${err.message}). Using fallback template.`);
      project = loadFallback(lane, pastRepos);
    }
  }

  stage(project);
})();

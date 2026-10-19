const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { validateSpec, findDuplicate, checkSpec, readQueue, SCAFFOLD_LINE } = require("../scripts/lib/spec");
const { AREAS } = require("../scripts/lib/areas");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "repos.json"), "utf8"));

// A minimal spec that passes the gate; tests override one thing at a time.
function makeSpec(over = {}) {
  return {
    repoName: "shift-swap",
    description: "Let hospital staff propose and approve shift swaps without a chain of emails.",
    area: "business-ops",
    audience: "Ward managers and nurses who swap shifts.",
    problem: "Shift swaps are arranged over email and get lost.",
    outcome: "Swaps are proposed, approved and visible in one place.",
    v1: "Propose and approve swaps from a CSV rota.",
    nextSteps: ["Calendar export", "Notify the manager"],
    acceptanceCriteria: ["A swap needs manager approval", "Rota totals are unchanged", "Invalid dates are rejected"],
    demo: "node cli.js examples/rota.csv",
    considerations: { privacy: "Invented names only", security: "Local files", accessibility: "Plain text output", oversight: "Manager approves every swap" },
    topics: ["scheduling", "healthcare", "nodejs"],
    files: [
      {
        path: "README.md",
        content: `# shift-swap\n\n## The problem\nx\n\n## Who it's for\nx\n\n## Try it\nx\n\n## Acceptance criteria\nx\n\n## Contribute\nx\n\n${SCAFFOLD_LINE}\n`,
      },
      { path: "src/swap.js", content: "module.exports = {};\n" },
      { path: "test/swap.test.js", content: "require('node:test');\n" },
    ],
    issue: { title: "Add a calendar export", body: "Good first issue." },
    ...over,
  };
}

test("the six queued specs pass the gate in queue order", () => {
  const queue = readQueue(path.join(ROOT, "templates", "queue"), manifest);
  assert.strictEqual(queue.length, 6);
  for (const q of queue) assert.deepStrictEqual([q.file, q.errors], [q.file, []]);
  assert.strictEqual(new Set(queue.map((q) => q.spec.area)).size, 6, "one spec per professional area");
});

test("the old generic fallback template can never pass the gate", () => {
  const generic = JSON.parse(fs.readFileSync(path.join(ROOT, "templates", "generic.json"), "utf8"));
  const { ok, errors } = validateSpec(generic);
  assert.strictEqual(ok, false);
  assert.ok(errors.includes("missing area"));
});

test("a representative spec from every area passes", () => {
  const samples = {
    "it-ops": ["cert-expiry-watch", "Warn IT before TLS certificates on internal hosts expire and break services."],
    "dev-tools": ["todo-deadline-scan", "Find TODO comments whose promised date has already passed, grouped by owner."],
    "qa-testing": ["bug-repro-steps", "Turn a vague bug report into numbered reproduction steps a tester can follow."],
    "people-ops": ["interview-panel-balancer", "Assign interview panels fairly so the same people aren't always interviewing."],
    "ai-automation": ["llm-json-guard", "Validate an AI model's JSON output against a schema before automation acts on it."],
    "business-ops": ["meeting-actions", "Turn meeting notes into a list of action items with owners and due dates."],
  };
  assert.deepStrictEqual(Object.keys(samples).sort(), AREAS.map((a) => a.key).sort());
  for (const [area, [repoName, description]] of Object.entries(samples)) {
    const verdict = checkSpec(makeSpec({ area, repoName, description }), manifest);
    assert.deepStrictEqual([repoName, verdict.errors], [repoName, []]);
  }
});

test("numbered copies of an existing project are rejected (fair-split-NN)", () => {
  const copy = makeSpec({ repoName: "fair-split-15" });
  assert.ok(validateSpec(copy).errors.some((e) => e.includes("must not end in a number")));
  assert.match(findDuplicate({ repoName: "fair-split-15", description: "x" }, manifest).reason, /same name as fair-split/);
});

test("a renamed project with the same description is a near-duplicate", () => {
  const dup = findDuplicate(
    { repoName: "bill-sharer", description: "Split a group bill fairly when people ordered different things." },
    manifest
  );
  assert.ok(dup, "expected a duplicate");
  assert.match(dup.reason, /similar to fair-split/);
});

test("distinct projects in the same domain are not flagged", () => {
  assert.strictEqual(
    findDuplicate({ repoName: "flaky-radar", description: "Compare JUnit XML results across CI runs to separate flaky tests from genuinely broken ones." }, manifest),
    null
  );
});

test("the gate names what is missing", () => {
  const cases = [
    [{ area: "gardening" }, /area must be one of/],
    [{ acceptanceCriteria: ["only one"] }, /acceptanceCriteria needs at least 3/],
    [{ considerations: { privacy: "x" } }, /considerations.security is required/],
    [{ description: "x".repeat(101) }, /over 100 characters/],
    [{ files: makeSpec().files.filter((f) => !f.path.startsWith("test/")).concat({ path: "src/b.js", content: "x" }) }, /test file is required/],
    [{ files: makeSpec().files.concat({ path: "../escape.js", content: "x" }) }, /unsafe file path/],
    [{ files: [{ path: "README.md", content: "# x" }, ...makeSpec().files.slice(1)] }, /missing a "## The problem" section/],
  ];
  for (const [over, re] of cases) {
    const { ok, errors } = validateSpec(makeSpec(over));
    assert.strictEqual(ok, false);
    assert.ok(errors.some((e) => re.test(e)), `${re} not in ${JSON.stringify(errors)}`);
  }
});

test("two near-duplicate specs in the queue can't both ship", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-queue-"));
  try {
    fs.writeFileSync(path.join(dir, "001-a.json"), JSON.stringify(makeSpec()));
    fs.writeFileSync(path.join(dir, "002-b.json"), JSON.stringify(makeSpec({ repoName: "swap-shifts" })));
    fs.writeFileSync(path.join(dir, "003-c.json"), "{ not json");
    const q = readQueue(dir, []);
    assert.deepStrictEqual(q.map((e) => e.ok), [true, false, false]);
    assert.match(q[1].errors[0], /near-duplicate/);
    assert.match(q[2].errors[0], /invalid JSON/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

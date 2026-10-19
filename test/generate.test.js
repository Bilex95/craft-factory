// generate.js is tested against a temporary root with a fake `generate`
// (API) function: no network, no publishing, nothing outside the temp dir.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pickArea, chooseProject, buildPrompt, apiFailureReason, main } = require("../scripts/generate");
const { AREAS } = require("../scripts/lib/areas");

const ROOT = path.join(__dirname, "..");
const QUEUE = path.join(ROOT, "templates", "queue");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "repos.json"), "utf8"));
const firstSpecFile = fs.readdirSync(QUEUE).filter((f) => f.endsWith(".json")).sort()[0];
const validSpec = () => JSON.parse(fs.readFileSync(path.join(QUEUE, firstSpecFile), "utf8"));
const generic = () => JSON.parse(fs.readFileSync(path.join(ROOT, "templates", "generic.json"), "utf8"));
const creditError = async () => {
  throw new Error('API error 400: {"error":{"message":"Your credit balance is too low to access the Anthropic API."}}');
};

// Temp factory root: repos.json + templates/queue with the given spec files.
function tempRoot(specs = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cf-gen-"));
  fs.mkdirSync(path.join(root, "templates", "queue"), { recursive: true });
  fs.writeFileSync(path.join(root, "repos.json"), JSON.stringify(manifest, null, 2));
  for (const [name, content] of Object.entries(specs)) {
    fs.writeFileSync(path.join(root, "templates", "queue", name), typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}
const quietly = async (fn) => {
  const log = console.log;
  const warn = console.warn;
  console.log = console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
};

test("pickArea prefers never-covered areas, then the least recently covered", () => {
  assert.strictEqual(pickArea([]).key, AREAS[0].key);
  // The real manifest covers business-ops, dev-tools and qa-testing only.
  assert.strictEqual(pickArea(manifest).key, "it-ops");
  const covered = ["it-ops", "people-ops", "ai-automation", "business-ops", "dev-tools", "qa-testing"].map((area) => ({ area }));
  assert.strictEqual(pickArea(covered).key, "it-ops"); // covered longest ago
  assert.strictEqual(pickArea([...covered, { area: "it-ops" }]).key, "people-ops");
  assert.strictEqual(pickArea([{ name: "recipe-scaler" }]).key, AREAS[0].key); // entries without area don't count
});

test("a valid queued spec is used and consumed; the API is not called", async () => {
  const root = tempRoot({ "012-a.json": validSpec() });
  try {
    let apiCalled = false;
    const result = await quietly(() =>
      chooseProject({ manifest, qdir: path.join(root, "templates", "queue"), area: AREAS[0], approach: "x", generate: async () => (apiCalled = true) })
    );
    assert.strictEqual(result.source, "queue (012-a.json)");
    assert.strictEqual(apiCalled, false);
    assert.deepStrictEqual(fs.readdirSync(path.join(root, "templates", "queue")), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("invalid queue specs are skipped and kept; no API credit means skip, not fallback", async () => {
  const root = tempRoot({ "012-bad.json": generic() });
  try {
    const result = await quietly(() =>
      chooseProject({ manifest, qdir: path.join(root, "templates", "queue"), area: AREAS[0], approach: "x", generate: creditError })
    );
    assert.deepStrictEqual(result, { skip: "The queue has no valid specs and the Claude API account has no credit." });
    assert.deepStrictEqual(fs.readdirSync(path.join(root, "templates", "queue")), ["012-bad.json"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("API output must pass the same gate: the fallback template and duplicates are refused", async () => {
  // A fresh, empty queue dir owned by this test: nothing outside it can be
  // read or consumed, and it is removed even if an assertion fails.
  const qdir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-empty-queue-"));
  try {
    const fromApi = (spec) => quietly(() => chooseProject({ manifest, qdir, area: AREAS[0], approach: "x", generate: async () => spec }));

    assert.match((await fromApi(generic())).skip, /failed the quality gate: missing area/);
    const numbered = { ...validSpec(), repoName: "api-drift-2" };
    assert.match((await fromApi(numbered)).skip, /must not end in a number/);
    const dup = { ...validSpec(), repoName: "api-drift" };
    assert.match((await fromApi(dup)).skip, /near-duplicate: same name as api-drift/);
    assert.deepStrictEqual(Object.keys(await fromApi(validSpec())), ["project", "source"]);
    assert.deepStrictEqual(fs.readdirSync(qdir), []);
  } finally {
    fs.rmSync(qdir, { recursive: true, force: true });
  }
});

test("apiFailureReason keeps the digest message short and readable", () => {
  assert.strictEqual(apiFailureReason("ANTHROPIC_API_KEY not set"), "ANTHROPIC_API_KEY is not set");
  assert.match(apiFailureReason("API error 529: " + "x".repeat(500)), /^the Claude API call failed \(API error 529: x+\)$/);
  assert.ok(apiFailureReason("API error 529: " + "x".repeat(500)).length < 160);
});

test("buildPrompt carries the area, the selection rules and every existing repo", () => {
  const prompt = buildPrompt(AREAS[3], "Use CSS Grid.", manifest);
  assert.ok(prompt.includes(AREAS[3].label) && prompt.includes(AREAS[3].audience));
  assert.ok(prompt.includes('"Who it\'s for"') && prompt.includes("node --test"));
  for (const r of manifest) assert.ok(prompt.includes(`- ${r.name}`), r.name);
});

test("main: nothing valid -> .skip-reason, published=false, manifest untouched", async () => {
  const root = tempRoot();
  const out = path.join(root, "gh-output");
  try {
    fs.writeFileSync(path.join(root, ".new-repo-name"), "stale-from-an-old-run");
    fs.mkdirSync(path.join(root, ".staging", "stale-from-an-old-run"), { recursive: true });
    await quietly(() => main({ root, env: { GITHUB_OUTPUT: out }, generate: creditError }));
    assert.strictEqual(fs.readFileSync(out, "utf8"), "published=false\n");
    assert.match(fs.readFileSync(path.join(root, ".skip-reason"), "utf8"), /no credit/);
    assert.ok(!fs.existsSync(path.join(root, ".new-repo-name")), "stale marker must be cleared");
    assert.ok(!fs.existsSync(path.join(root, ".staging")));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, "repos.json"), "utf8")), manifest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("main: valid queue spec -> staged, manifest gains it with its area, published=true", async () => {
  const spec = validSpec();
  const root = tempRoot({ [firstSpecFile]: spec });
  const out = path.join(root, "gh-output");
  try {
    await quietly(() => main({ root, env: { GITHUB_OUTPUT: out }, generate: creditError }));
    assert.strictEqual(fs.readFileSync(out, "utf8"), "published=true\n");
    assert.strictEqual(fs.readFileSync(path.join(root, ".new-repo-name"), "utf8"), spec.repoName);
    for (const f of spec.files) assert.ok(fs.existsSync(path.join(root, ".staging", spec.repoName, f.path)), f.path);
    const after = JSON.parse(fs.readFileSync(path.join(root, "repos.json"), "utf8"));
    assert.strictEqual(after.length, manifest.length + 1);
    assert.deepStrictEqual(
      { name: after.at(-1).name, area: after.at(-1).area },
      { name: spec.repoName, area: spec.area }
    );
    assert.ok(!fs.existsSync(path.join(root, ".skip-reason")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

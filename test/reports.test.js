// digest.js and refine.js run end-to-end against a recording fake `io`, so
// these tests never call GitHub. Every create/comment/close is captured.
// Contributor handles below are fictional fixtures, not real accounts.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const digest = require("../scripts/digest");
const refine = require("../scripts/refine");
const { HISTORICAL_CUTOFF, previousReport, restockAction, PREFIX } = require("../scripts/lib/issues");

const ZW = String.fromCharCode(0x200b);
const FACTORY = "owner/craft-factory";
const ROOT = path.join(__dirname, "..");
const QUEUE = path.join(ROOT, "templates", "queue");
const queueFiles = fs.readdirSync(QUEUE).filter((f) => f.endsWith(".json")).sort();

// `fail` maps an operation name to an Error to throw: "list", "comment",
// "close", "createRestock" or "createDigest".
function fakeIO({ open = [], prs = {}, issues = {}, fail = {} } = {}) {
  const calls = [];
  let next = 100;
  const repoOf = (args) => (args.match(/--repo (\S+)/) || args.match(/view (\S+)/))[1].split("/")[1];
  const maybeFail = (op) => {
    if (fail[op]) throw fail[op];
  };
  return {
    calls,
    ghJSON(args) {
      if (args.startsWith("pr list")) return prs[repoOf(args)] || [];
      if (args.startsWith("repo view")) return { url: `https://github.com/owner/${repoOf(args)}`, pushedAt: new Date().toISOString(), description: "d", repositoryTopics: [{ name: "t" }] };
      if (args.includes("good first issue")) return [];
      if (args.startsWith("issue list")) return issues[repoOf(args)] || [];
      throw new Error(`unexpected gh call: ${args}`);
    },
    listOpenIssues: () => {
      maybeFail("list");
      return open;
    },
    createIssue(repo, title, body) {
      maybeFail(title.startsWith(PREFIX.restock) ? "createRestock" : "createDigest");
      const number = next++;
      calls.push({ op: "create", repo, title, body, number });
      return `https://github.com/${repo}/issues/${number}`;
    },
    commentIssue: (repo, number, body) => {
      maybeFail("comment");
      calls.push({ op: "comment", repo, number, body });
    },
    closeIssue: (repo, number, body) => {
      maybeFail("close");
      calls.push({ op: "close", repo, number, body });
    },
  };
}

// Runs fn with a temp root (two-repo manifest, `valid` queued specs, optional
// marker files) and always removes that root afterwards, even on failure.
function withRoot({ valid = 0, files = {} } = {}, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cf-rep-"));
  try {
    const q = path.join(root, "templates", "queue");
    fs.mkdirSync(q, { recursive: true });
    fs.writeFileSync(
      path.join(root, "repos.json"),
      JSON.stringify([
        { name: "recipe-scaler", description: "Scale a recipe." },
        { name: "fair-split-13", description: "Split a bill." },
      ])
    );
    for (const f of queueFiles.slice(0, valid)) fs.copyFileSync(path.join(QUEUE, f), path.join(q, f));
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(root, name), content);
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Captures warnings so tests can assert on them without noisy output.
function run(script, opts, warnings = []) {
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = (msg) => warnings.push(String(msg));
  try {
    return script.main({ owner: "owner", factory: FACTORY, today: "2026-10-20", ...opts });
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

// Historical issues (#43 and below) that automation must never touch...
const historical = [
  { number: 42, title: "📋 Project digest — 2026-10-06" },
  { number: 38, title: "📋 Project digest — 2026-09-29" },
  { number: 43, title: "🔨 Refinement pass — 2026-10-08" },
  { number: 40, title: "🔨 Refinement pass — 2026-10-01" },
  { number: 41, title: "🪣 Project queue is empty — time to restock" },
  { number: 37, title: "🪣 Project queue is empty — time to restock" },
];
// ...and newer ones it manages as usual.
const newer = [
  { number: 48, title: "📋 Project digest — 2026-10-27" },
  { number: 45, title: "📋 Project digest — 2026-10-13" },
  { number: 49, title: "🔨 Refinement pass — 2026-10-29" },
  { number: 47, title: "🔨 Refinement pass — 2026-10-22" },
  { number: 50, title: "🪣 Project queue is running low — time to restock" },
  { number: 44, title: "🪣 Project queue is empty — time to restock" },
];
const open = [...historical, ...newer];
const SKIPPED = { ".skip-reason": "The queue has no valid specs and the Claude API account has no credit." };

// --- M1: historical cutoff ------------------------------------------------------

test("cutoff boundary: #43 is never selected, #44 is", () => {
  assert.strictEqual(HISTORICAL_CUTOFF, 43);
  const restock43 = [{ number: 43, title: `${PREFIX.restock} is empty` }];
  const restock44 = [{ number: 44, title: `${PREFIX.restock} is empty` }];
  assert.deepStrictEqual(restockAction(0, restock43), { type: "create" });
  assert.deepStrictEqual(restockAction(5, restock43), { type: "none" });
  assert.deepStrictEqual(restockAction(0, restock44), { type: "comment", issue: restock44[0] });
  assert.deepStrictEqual(restockAction(5, restock44), { type: "close", issue: restock44[0] });
  assert.strictEqual(previousReport([{ number: 43, title: `${PREFIX.digest} — x` }], PREFIX.digest, 100), null);
  assert.deepStrictEqual(previousReport([{ number: 44, title: `${PREFIX.digest} — x` }], PREFIX.digest, 100), { number: 44, title: `${PREFIX.digest} — x` });
});

test("digest with only historical issues open: none are closed or commented on", () => {
  withRoot({ valid: 5, files: { ".new-repo-name": "log-fingerprint" } }, (root) => {
    const io = fakeIO({ open: historical });
    run(digest, { io, root });
    assert.deepStrictEqual(io.calls.map((c) => c.op), ["create"]); // just the digest
  });
  withRoot({ files: SKIPPED }, (root) => {
    const io = fakeIO({ open: historical });
    run(digest, { io, root });
    // Low queue: a NEW alert is opened rather than reusing historical #41.
    assert.deepStrictEqual(io.calls.map((c) => [c.op, c.title]), [
      ["create", "🪣 Project queue is empty — time to restock"],
      ["create", "📋 Project digest — 2026-10-20"],
    ]);
  });
});

test("refine with only historical passes open closes nothing", () => {
  withRoot({}, (root) => {
    const io = fakeIO({ open: historical });
    run(refine, { io, root });
    assert.deepStrictEqual(io.calls.map((c) => c.op), ["create"]);
  });
});

// --- digest behaviour on newer issues --------------------------------------------

test("digest: a skipped run says why, comments on the newest alert, supersedes only the newest digest", () => {
  withRoot({ files: SKIPPED }, (root) => {
    const io = fakeIO({ open });
    run(digest, { io, root });
    const [comment, create, close, ...rest] = io.calls;
    assert.deepStrictEqual(rest, []);
    assert.deepStrictEqual([comment.op, comment.number], ["comment", 50]);
    assert.match(comment.body, /Still 0 valid spec/);
    assert.strictEqual(create.title, "📋 Project digest — 2026-10-20");
    assert.match(create.body, /No new project this run\.\*\* The queue has no valid specs and the Claude API account has no credit\./);
    assert.ok(!create.body.includes("New project published"));
    assert.deepStrictEqual([close.op, close.number, close.body], ["close", 48, `Superseded by #${create.number}.`]);
  });
});

test("digest: no open alert and a low queue opens exactly one restock alert", () => {
  withRoot({ valid: 2 }, (root) => {
    const io = fakeIO({ open: [] });
    run(digest, { io, root });
    const creates = io.calls.filter((c) => c.op === "create");
    assert.deepStrictEqual(creates.map((c) => c.title), ["🪣 Project queue is running low — time to restock", "📋 Project digest — 2026-10-20"]);
    assert.match(creates[0].body, /Only 2 valid project spec/);
    assert.match(creates[0].body, /https:\/\/github\.com\/owner\/craft-factory\/blob\/main\/templates\/SPEC\.md/);
    assert.ok(!io.calls.some((c) => c.op === "close"));
  });
});

test("digest: a replenished queue closes only the newest restock alert", () => {
  withRoot({ valid: 4, files: { ".new-repo-name": "log-fingerprint" } }, (root) => {
    const io = fakeIO({ open });
    run(digest, { io, root });
    assert.deepStrictEqual(io.calls.filter((c) => c.op === "close").map((c) => c.number), [50, 48]);
    const body = io.calls.find((c) => c.op === "create").body;
    assert.match(body, /New project published:\*\* \[log-fingerprint\]/);
    assert.match(body, /Queue: \*\*4 valid spec\(s\) remaining/);
  });
});

// --- M2: restock failures never cost the digest --------------------------------------

for (const [op, setup] of [
  ["list", { files: SKIPPED }],
  ["comment", { files: SKIPPED }],
  ["createRestock", { files: SKIPPED, open: [] }],
  ["close", { valid: 4 }],
]) {
  test(`digest still posts when restock handling fails (${op})`, () => {
    withRoot(setup, (root) => {
      const io = fakeIO({ open: setup.open ?? open, fail: { [op]: new Error(`gh: HTTP 502 during ${op}`) } });
      const warnings = [];
      run(digest, { io, root }, warnings);
      assert.strictEqual(io.calls.filter((c) => c.op === "create" && c.title.startsWith(PREFIX.digest)).length, 1);
      assert.ok(
        warnings.some((w) => w.includes("Restock alert handling failed") && w.includes(`HTTP 502 during ${op}`)),
        `expected a restock warning, got ${JSON.stringify(warnings)}`
      );
    });
  });
}

test("digest: if posting the digest itself fails, the error propagates and nothing is closed", () => {
  withRoot({ valid: 5 }, (root) => {
    const io = fakeIO({ open: newer.filter((i) => !i.title.startsWith(PREFIX.restock)), fail: { createDigest: new Error("gh: HTTP 502") } });
    assert.throws(() => run(digest, { io, root }), /HTTP 502/);
    assert.deepStrictEqual(io.calls, []);
  });
});

// --- notification safety ----------------------------------------------------------------

test("digest: contributors are linked, never @mentioned", () => {
  withRoot({ valid: 5 }, (root) => {
    const io = fakeIO({
      prs: { "recipe-scaler": [{ number: 2, title: "Add a copy button, thanks @bob", author: { login: "fixture-user-a" } }] },
      issues: { "fair-split-13": [{ number: 1, title: "Copy summary", comments: [{ author: { login: "dependabot[bot]" } }] }] },
    });
    run(digest, { io, root });
    const body = io.calls.find((c) => c.op === "create").body;
    assert.ok(body.includes("(from [fixture-user-a](https://github.com/fixture-user-a))"));
    assert.ok(body.includes(`thanks @${ZW}bob`));
    assert.ok(body.includes("[dependabot[bot]](https://github.com/apps/dependabot)"));
    assert.ok(!/(^|[^\w])@[A-Za-z0-9-]/.test(body), "no live @mention may remain");
  });
});

test("refine: new checklist items, quiet mentions, supersedes only the newest pass", () => {
  withRoot({}, (root) => {
    const io = fakeIO({
      open,
      prs: { "fair-split-13": [{ number: 2, title: "feat: copy summary (#1)", author: { login: "fixture-user-b" } }] },
      issues: { "recipe-scaler": [{ number: 1, title: "Question for @alice", comments: [{ author: { login: "fixture-user-c" } }] }] },
    });
    run(refine, { io, root });
    const create = io.calls.find((c) => c.op === "create");
    assert.strictEqual(create.title, "🔨 Refinement pass — 2026-10-20");
    assert.match(create.body, /Use it as the person in "Who it's for" would/);
    assert.match(create.body, /Safety pass: examples use invented data only/);
    assert.ok(create.body.includes("([fixture-user-b](https://github.com/fixture-user-b))"));
    assert.ok(create.body.includes(`Question for @${ZW}alice`));
    assert.ok(!/(^|[^\w])@[A-Za-z0-9-]/.test(create.body), "no live @mention may remain");
    assert.deepStrictEqual(
      io.calls.filter((c) => c.op === "close").map((c) => [c.number, c.body]),
      [[49, `Superseded by #${create.number}.`]]
    );
  });
});

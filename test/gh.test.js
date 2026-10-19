// listOpenIssues pagination, driven by a fake page fetcher: no network, no gh.
const test = require("node:test");
const assert = require("node:assert");
const { listOpenIssues, PER_PAGE, MAX_PAGES } = require("../scripts/lib/gh");

// Builds a fake fetcher over `total` items; every `prEvery`-th item is a PR.
function pages(total, { prEvery = 0 } = {}) {
  const requested = [];
  const fetchPage = (repo, page) => {
    requested.push(page);
    const start = (page - 1) * PER_PAGE;
    return Array.from({ length: Math.max(0, Math.min(PER_PAGE, total - start)) }, (_, k) => {
      const n = start + k + 1;
      return { number: n, title: `Issue ${n}`, ...(prEvery && n % prEvery === 0 ? { pull_request: {} } : {}) };
    });
  };
  return { fetchPage, requested };
}

const quietWarn = (fn) => {
  const warnings = [];
  const warn = console.warn;
  console.warn = (m) => warnings.push(String(m));
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = warn;
  }
};

test("one short page is a single request", () => {
  const { fetchPage, requested } = pages(40);
  const issues = listOpenIssues("o/r", fetchPage);
  assert.strictEqual(issues.length, 40);
  assert.deepStrictEqual(requested, [1]);
  assert.deepStrictEqual(issues[0], { number: 1, title: "Issue 1" });
});

test("reads every page until a short one (more than the old 200 limit)", () => {
  const { fetchPage, requested } = pages(250);
  assert.strictEqual(listOpenIssues("o/r", fetchPage).length, 250);
  assert.deepStrictEqual(requested, [1, 2, 3]);
});

test("an exact multiple of the page size stops on the empty page", () => {
  const { fetchPage, requested } = pages(200);
  assert.strictEqual(listOpenIssues("o/r", fetchPage).length, 200);
  assert.deepStrictEqual(requested, [1, 2, 3]);
});

test("pull requests are dropped but still count towards paging", () => {
  const { fetchPage, requested } = pages(150, { prEvery: 3 });
  const issues = listOpenIssues("o/r", fetchPage);
  assert.strictEqual(issues.length, 100); // 150 minus 50 PRs
  assert.ok(issues.every((i) => i.number % 3 !== 0));
  assert.deepStrictEqual(requested, [1, 2]);
});

test("stops at MAX_PAGES and warns instead of reading forever", () => {
  const { fetchPage, requested } = pages(PER_PAGE * MAX_PAGES + 500);
  const { result, warnings } = quietWarn(() => listOpenIssues("o/r", fetchPage));
  assert.strictEqual(result.length, PER_PAGE * MAX_PAGES);
  assert.strictEqual(requested.length, MAX_PAGES);
  assert.match(warnings[0], /more than 2000 open issues/);
});

test("an unexpected response is an error, not an empty list", () => {
  assert.throws(() => listOpenIssues("o/r", () => ({ message: "Not Found" })), /Unexpected issues response for o\/r page 1/);
});

// Notification-safe rendering (PR #39): contributor names and titles in the
// digest/refine issues must never @mention anyone.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ZW = String.fromCharCode(0x200b);
const ESCAPE = String.fromCharCode(92) + "u200B"; // backslash-u200B, as written in the scripts

for (const file of ["digest", "refine"]) {
  const { quiet, quietUser } = require(`../scripts/${file}.js`);

  test(`${file}: quietUser links profiles and apps without @`, () => {
    assert.strictEqual(quietUser("bob"), "[bob](https://github.com/bob)");
    assert.strictEqual(quietUser("jane-doe"), "[jane-doe](https://github.com/jane-doe)");
    assert.strictEqual(quietUser("dependabot[bot]"), "[dependabot[bot]](https://github.com/apps/dependabot)");
    assert.strictEqual(quietUser("github-actions[bot]"), "[github-actions[bot]](https://github.com/apps/github-actions)");
    for (const missing of [undefined, null, ""]) assert.strictEqual(quietUser(missing), "unknown");
  });

  test(`${file}: quiet defuses mentions`, () => {
    assert.strictEqual(quiet("ping @bob please"), `ping @${ZW}bob please`);
    assert.strictEqual(quiet("@bob fix this"), `@${ZW}bob fix this`);
    assert.strictEqual(quiet("thanks (@bob)"), `thanks (@${ZW}bob)`);
    assert.strictEqual(quiet("cc @jane-doe"), `cc @${ZW}jane-doe`);
    assert.strictEqual(quiet("cc @acme/qa"), `cc @${ZW}acme/qa`);
  });

  test(`${file}: quiet leaves emails, lone @ and empty input alone`, () => {
    for (const s of ["mail bob@example.com", "mail bob_@example.com", "mail a.b+tag@example.com", "@", "a @ b"]) {
      assert.strictEqual(quiet(s), s);
    }
    assert.strictEqual(quiet("bob@example.com cc @alice"), `bob@example.com cc @${ZW}alice`);
    assert.strictEqual(quiet(null), "");
  });

  test(`${file}: quiet is idempotent`, () => {
    for (const s of ["hi @bob", "(@bob)", "cc @acme/qa", "bob@example.com cc @alice", "@"]) {
      assert.strictEqual(quiet(quiet(s)), quiet(s));
    }
  });

  test(`${file}: source uses the \\u200B escape, not a raw zero-width space`, () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "scripts", `${file}.js`), "utf8");
    assert.ok(src.includes(`"@${ESCAPE}"`));
    assert.ok(!src.includes(ZW));
  });
}

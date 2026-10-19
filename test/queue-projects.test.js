// Every queued project must actually work: write its files to a fresh temp
// dir, run its own `node --test` there, then delete the dir. Projects are
// dependency-free by rule, so no install step is needed.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const QUEUE = path.join(__dirname, "..", "templates", "queue");
const files = fs.existsSync(QUEUE) ? fs.readdirSync(QUEUE).filter((f) => f.endsWith(".json")).sort() : [];

for (const file of files) {
  test(`queued project ${file} passes its own tests`, () => {
    const spec = JSON.parse(fs.readFileSync(path.join(QUEUE, file), "utf8"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-project-"));
    try {
      for (const f of spec.files) {
        const dest = path.join(dir, f.path);
        assert.ok(dest.startsWith(dir + path.sep), `unsafe path ${f.path}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, f.content);
      }
      // A clean env: don't let the outer test runner's settings leak in.
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      delete env.NODE_OPTIONS;
      const res = spawnSync(process.execPath, ["--test"], { cwd: dir, env, encoding: "utf8", timeout: 60000 });
      assert.strictEqual(res.status, 0, `${spec.repoName} tests failed:\n${res.stdout}\n${res.stderr}`);
      assert.match(res.stdout, /# fail 0|ℹ fail 0/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

# 🏭 craft-factory

The automation behind my project portfolio. It runs twice a week, at a slightly different time each run:

- **Tuesday afternoon** — takes the next project spec from the hand-curated queue (or, if the queue is empty, asks the Claude API for one in the professional area that has gone longest without a project: IT & ops, software development, QA & testing, HR & people ops, AI & workflow automation, or finance/ops & knowledge work). Every spec must solve a *real workplace problem for a named group of people*, ship with acceptance criteria, a working test and an offline demo, and pass a duplicate check against every previous repo. If it passes, the factory **publishes it** as a new public repo with a description, topics and a scoped `good first issue`, then **posts a digest** here. If nothing passes, **nothing is published** — the digest says why.
- **Thursday** — posts a **refinement pass**: a concrete hand-refinement checklist for the newest repo(s), a rot scan across the whole portfolio, and anything waiting on my reply. It never commits code.

Each new digest or refinement pass closes the previous one; a single restock alert stays open while the queue is low and closes itself once it's refilled. Contributors are linked, never @mentioned, so they aren't pinged by notes meant for me.

Then I do the part automation can't: I open the new project, refine it by hand, and push real commits. The scaffold is generated; the craft is mine.

## The portfolio

Every generated repo is listed in [`repos.json`](repos.json) and pinned highlights are on [my profile](https://github.com/Bilex95).

## Run your own

Fork this, add `ANTHROPIC_API_KEY` and `GH_PAT` secrets, and adjust the problem areas in [`scripts/lib/areas.js`](scripts/lib/areas.js) to your own skills. What a project spec must contain is in [`templates/SPEC.md`](templates/SPEC.md). Full walkthrough in [`SETUP.md`](SETUP.md).

Tests: `node --test` (Node 20+, no dependencies). They run offline with fakes in place of GitHub and the API, and CI runs them on every pull request.

# 🏭 craft-factory

The automation behind my project portfolio. It runs twice a week, at a slightly different time each run:

- **Tuesday afternoon** — picks a lane from a rotation (Playwright suites, Cypress suites, API contract testing, accessibility audits, form UX, UI micro-tools, QA workflow automation), generates a project brief and scaffold via the Claude API — always solving a *real everyday problem*, always checked against every previous repo so nothing repeats, with a different technical approach constraint each time — **publishes it** as a new public repo with a description, topics, and a scoped `good first issue`, then **posts a digest** here.
- **Thursday** — posts a **refinement pass**: a concrete hand-refinement checklist for the newest repo(s), a rot scan across the whole portfolio, and anything waiting on my reply. It never commits code.

Then I do the part automation can't: I open the new project, refine it by hand, and push real commits. The scaffold is generated; the craft is mine.

## The portfolio

Every generated repo is listed in [`repos.json`](repos.json) and pinned highlights are on [my profile](https://github.com/Bilex95).

## Run your own

Fork this, add `ANTHROPIC_API_KEY` and `GH_PAT` secrets, and adjust the lanes in [`scripts/generate.js`](scripts/generate.js) to your own skills. Full walkthrough in [`SETUP.md`](SETUP.md).

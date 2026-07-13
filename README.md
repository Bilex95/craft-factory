# 🏭 craft-factory

The automation behind my weekly project portfolio. Every Wednesday afternoon (at a slightly different time each week), this repo:

1. **Picks a lane** from a 7-week rotation: UI micro-tools, form UX, Playwright suites, Cypress suites, API testing, accessibility retrofits, and workflow automation.
2. **Generates a project brief and scaffold** via the Claude API — always solving a *real everyday problem*, always checked against every previous repo so nothing repeats, with a different technical approach constraint each week.
3. **Publishes it** as a new public repo with a description, topics, and a scoped `good first issue`.
4. **Posts a digest** here so I know what shipped and which contributor PRs/issues are waiting on me.

Then I do the part automation can't: each week I open the new project, refine it by hand, and push real commits. The scaffold is generated; the craft is mine.

## The portfolio

Every generated repo is listed in [`repos.json`](repos.json) and pinned highlights are on [my profile](https://github.com/Bilex95).

## Run your own

Fork this, add `ANTHROPIC_API_KEY` and `GH_PAT` secrets, and adjust the lanes in [`scripts/generate.js`](scripts/generate.js) to your own skills. Details in the workflow file.

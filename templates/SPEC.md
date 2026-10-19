# Project spec guide

Every project the factory publishes is a JSON spec in `templates/queue/` (or one the Claude API returns when the queue is empty). Specs are checked by [`scripts/lib/spec.js`](../scripts/lib/spec.js) before anything is published. **A spec that fails is skipped, never published** — and if no spec passes, nothing ships that week.

## What makes a good project

The factory builds small tools that make someone's working life better. Each spec must:

1. **Start from a real workplace problem** — name who has it and what it costs them (time, errors, stress, risk).
2. **Produce a useful, demonstrable outcome** — someone can try it in under 5 minutes with included sample input and see the problem solved. Not a technology showcase.
3. **Scope a complete first version** (`v1`) and list realistic `nextSteps`.
4. **Not repeat an existing project.** Names are compared ignoring numeric suffixes (`fair-split-14` = `fair-split`), and descriptions are compared for keyword overlap.
5. **Prove it works**: at least 3 `acceptanceCriteria` and at least one test that runs with plain `node --test` (no dependencies).
6. **State its considerations** — privacy, security, accessibility, human oversight. Write "Not applicable" plus the reason when one doesn't apply. Examples use invented data only; anything that acts automatically needs a human approval step.
7. **Work offline** — no paid APIs or secrets in the demo.

## Problem areas

Defined in [`scripts/lib/areas.js`](../scripts/lib/areas.js). When the queue is empty, the generator asks the API for a project in the area that has gone longest without one.

| `area` | For |
| --- | --- |
| `it-ops` | IT support staff, sysadmins and on-call engineers |
| `dev-tools` | Developers and tech leads |
| `qa-testing` | QA engineers, SDETs and developers who own tests |
| `people-ops` | HR generalists, recruiters, people managers and new hires |
| `ai-automation` | Teams adopting AI tools and the people who build their automations |
| `business-ops` | Finance and ops staff, project managers, support agents, knowledge workers |

## Spec format

```jsonc
{
  "repoName": "kebab-case-name",            // max 50 chars, must not end in a number
  "description": "One line, max 100 chars",
  "area": "it-ops",                         // one of the keys above
  "audience": "Who has this problem",
  "problem": "The problem and what it costs them",
  "outcome": "What is better after using this",
  "v1": "What this version does — and deliberately doesn't",
  "nextSteps": ["...", "..."],              // at least 2
  "acceptanceCriteria": ["...", "...", "..."], // at least 3
  "demo": "Exact steps to see it working with the sample input",
  "considerations": { "privacy": "...", "security": "...", "accessibility": "...", "oversight": "..." },
  "topics": ["tag1", "tag2", "tag3"],       // 3 to 8
  "files": [{ "path": "README.md", "content": "..." }], // 3 to 6 files, including a test file
  "issue": { "title": "...", "body": "..." } // one good first issue, under an hour
}
```

`README.md` must contain these `## ` headings: **The problem**, **Who it's for**, **Try it**, **Acceptance criteria**, **Contribute** (recommended too: *What it does*, *How it's built*, *Limits and safety*), and this exact line near the bottom:

> Scaffolded by an automated weekly pipeline, then refined by hand — see the factory repo for how it works.

The queued specs `012`–`017` are complete examples.

## Restocking the queue

1. In a Claude chat, paste this file and `repos.json`, and ask for 6 specs that follow it — ideally from areas that `repos.json` covers least.
2. Save each one as `templates/queue/NNN-name.json`, numbered after the last one so they run in order.
3. Run `node --test`. It checks every queued spec against the gate (and against the specs queued before it), then writes each project to a temp folder and runs its own tests.
4. Commit and push. The open 🪣 restock alert closes itself on the next Tuesday run once more than 3 valid specs are queued.

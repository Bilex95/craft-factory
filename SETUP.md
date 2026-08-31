# Setup Guide

## 1. Create a Personal Access Token (needed to create new repos)

The default Actions token can't create repos outside itself, so you need a PAT.

**Recommended — fine-grained token:** GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Resource owner = your account, repository access = **All repositories**, permissions:

| Permission | Access |
| --- | --- |
| Administration | Read and write *(creates repos)* |
| Contents | Read and write |
| Issues | Read and write |
| Metadata | Read *(auto-selected)* |

Expiration: take the max (366 days) and set a calendar reminder.

**Classic token (simpler, broader):** Tokens (classic) → Generate new token → scope **repo**. Add **workflow** only if you want generated repos to contain their own CI. 90 days, with a rotation reminder. Avoid "no expiration".

Copy the token — you only see it once. Store it as the `GH_PAT` repo secret (below); rotating the token means updating that secret.

## 2. Create the factory repo (public)

```bash
cd craft-factory
git init -b main
git add -A && git commit -m "Craft factory: weekly project pipeline"
gh repo create craft-factory --public --source=. --push
```

## 3. Add secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `GH_PAT` | the token from step 1. **A classic token with the `repo` scope is the reliable choice** — fine-grained tokens can only create repos when scoped to *All repositories* with *Administration: read/write*. If publishing fails with `401 Bad credentials` or `Resource not accessible by personal access token (createRepository)`, this secret is the cause. |
| `ANTHROPIC_API_KEY` | Optional. Only used when the queue in `templates/queue/` is empty — then the generator calls the Claude API to invent the next project instead of falling back to the bundled generic template. Add it once the queue is running low if you don't want to keep topping it up by hand. Not needed while specs are queued. |

## 4. Test it

**Actions → Craft Project (Tue/Thu) → Run workflow.** Set **mode** to `new` (skip_delay is on by default for manual runs).
Within ~2 minutes you should see: a new public repo on your profile, topics + description set, a good-first-issue inside it, and a "📋 Project digest" issue in craft-factory.

Run it again with **mode** `refine` to check the Thursday path — it should post a "🔨 Refinement pass" issue and touch nothing else.

## 5. Notifications (this is your "Claude notified me" replacement)

- Install the **GitHub mobile app** and sign in — you'll get push notifications.
- github.com → **Settings → Notifications** → enable **Email** and **Web/Mobile** for *Participating* and *Watching*.
- You automatically "watch" repos you create, so **every issue, PR, and comment from anyone pings you instantly** — including the weekly digest and the "🔔 needs your attention" alerts this factory posts.

## 6. The ritual (~1 hour per project, the part that makes it yours)

- **Tuesday** — the "📋 Project digest" issue lands with the new repo. Open it, use it, find something real to improve, push 2–5 commits.
- **Thursday** — the "🔨 Refinement pass" issue lands with a checklist for your newest repo(s), a portfolio rot scan, and anything waiting on your reply. Work the checklist; reply to contributors.
- **Monthly** — pin your best 4–6 repos on your profile.

## Timing

Cron fires **Tuesday and Thursday** at 11:05 UTC, then sleeps 0–3h randomly → publishes between **12:05 and 15:05 WAT**, different each run. Tuesday = new project; Thursday = refinement pass (no new repo). A `decide` job routes by weekday; a manual run picks the path via the **mode** input. Edit the cron line in `.github/workflows/craft-project.yml` to change days.

## Queue mode (no API key needed)

The generator checks `templates/queue/` FIRST. If specs are there, it uses the oldest one and no API call happens at all.

**To top up:** ask Claude in a chat — "generate 6 more project specs for my craft-factory queue, here's my repos.json so nothing repeats" — then save the JSON files into `templates/queue/` with the next numbers so they run in order, commit, and push. The digest warns you when the queue is running low (≤ 3 specs left).

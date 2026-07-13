# Setup Guide (for Tobi — delete after setup)

## 1. Create a Personal Access Token (needed to create new repos)

The default Actions token can't create repos outside itself, so:

1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**
2. Scopes: check **repo** (and **workflow** if you ever want generated repos to contain workflows)
3. Expiration: 90 days is fine — set a reminder to rotate it
4. Copy the token

## 2. Create the factory repo (public)

```bash
cd craft-factory
git init -b main
git add -A && git commit -m "Craft factory: weekly project pipeline"
gh repo create craft-factory --public --source=. --push
```

## 3. Add secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | OPTIONAL — skip it! Queue mode (see below) needs no key |
| `GH_PAT` | the token from step 1 |

## 4. Test it

**Actions → Weekly Craft Project → Run workflow** (skip_delay is on by default for manual runs).
Within ~2 minutes you should see: a new public repo on your profile, topics + description set, a good-first-issue inside it, and a "📋 Weekly digest" issue in craft-factory.

## 5. Notifications (this is your "Claude notified me" replacement)

- Install the **GitHub mobile app** and sign in — you'll get push notifications.
- github.com → **Settings → Notifications** → enable **Email** and **Web/Mobile** for *Participating* and *Watching*.
- You automatically "watch" repos you create, so **every issue, PR, and comment from anyone pings you instantly** — including the weekly digest and the "🔔 needs your attention" alerts this factory posts.

## 6. Weekly ritual (~1 hour, the part that makes it yours)

When the digest lands each Wednesday:
1. Open the new repo, use it, find something to improve, push 2–5 real commits.
2. Reply to any contributor issues/PRs the digest flagged.
3. Every month or so, pin your best 4–6 repos on your profile.

## Timing

Cron fires Wednesday 11:05 UTC, then sleeps 0–3h randomly → publishes between **12:05 and 15:05 WAT**, different each week. Edit the cron line in `.github/workflows/weekly-project.yml` to change the day.

## Your old daily-log repo

Recommendation from our chat: disable its cron workflow (or archive the repo). Real weekly projects make the manufactured streak unnecessary.


## Queue mode (no API key needed)

The generator checks `templates/queue/` FIRST. If specs are there, it uses the oldest one and no API call happens at all. You start with 4 weeks pre-stocked (meeting-meter, naija-phone-input, checkout-guard, modal-rescue).

**To top up:** ask Claude in a chat — "generate 4 more project specs for my craft-factory queue, here's my repos.json so nothing repeats" — then save the JSON files into `templates/queue/` (named `005-...json`, `006-...json` so they run in order), commit, and push. The weekly digest warns you when the queue is nearly empty.

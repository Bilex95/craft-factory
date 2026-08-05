#!/usr/bin/env bash
# Publishes the staged project as a new PUBLIC repo under $GH_OWNER.
# Requires: GH_TOKEN (PAT with repo scope), GH_OWNER.
# Set DRY_RUN=true to test locally without touching GitHub.

set -euo pipefail

NAME=$(cat .new-repo-name)
META=".new-repo-meta.json"
DIR=".staging/${NAME}"
DESC=$(node -e "console.log(require('./${META}').description || '')")
TOPICS=$(node -e "console.log((require('./${META}').topics || []).join(','))")

if [ ! -d "$DIR" ]; then
  echo "Staged project not found at ${DIR}" >&2
  exit 1
fi

if [ "${DRY_RUN:-false}" = "true" ]; then
  echo "[DRY RUN] Would create public repo ${GH_OWNER:-<owner>}/${NAME}"
  echo "[DRY RUN] Description: ${DESC}"
  echo "[DRY RUN] Topics: ${TOPICS}"
  echo "[DRY RUN] Files:"
  find "$DIR" -type f | sed 's/^/    /'
  exit 0
fi

cd "$DIR"
git init -b main
git config user.name "${GH_OWNER}"
git config user.email "${GH_OWNER}@users.noreply.github.com"
git add -A
git commit -m "Initial release: ${DESC:-$NAME}"

# Create the public repo and push
gh repo create "${GH_OWNER}/${NAME}" --public --description "${DESC}" --source=. --push

# Topics (best-effort)
if [ -n "$TOPICS" ]; then
  IFS=',' read -ra TOPIC_ARR <<< "$TOPICS"
  ADD_TOPIC_ARGS=()
  for t in "${TOPIC_ARR[@]}"; do
    ADD_TOPIC_ARGS+=(--add-topic "$t")
  done
  gh repo edit "${GH_OWNER}/${NAME}" "${ADD_TOPIC_ARGS[@]}" || true
fi

# Good first issue (best-effort)
cd ../..
HAS_ISSUE=$(node -e "console.log(require('./${META}').issue ? 'yes' : 'no')")
if [ "$HAS_ISSUE" = "yes" ]; then
  TITLE=$(node -e "console.log(require('./${META}').issue.title)")
  BODY=$(node -e "console.log(require('./${META}').issue.body)")
  gh label create "good first issue" \
    --repo "${GH_OWNER}/${NAME}" \
    --color 7057ff \
    --description "Scoped to under an hour" 2>/dev/null || true
  gh issue create \
    --repo "${GH_OWNER}/${NAME}" \
    --title "$TITLE" \
    --body "$BODY" \
    --label "good first issue" \
  || gh issue create --repo "${GH_OWNER}/${NAME}" --title "$TITLE" --body "$BODY" \
  || true
fi

echo "Published: https://github.com/${GH_OWNER}/${NAME}"

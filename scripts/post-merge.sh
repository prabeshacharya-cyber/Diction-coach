#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

if [ -n "$GITHUB_TOKEN" ] && [ -n "$GITHUB_REPO_URL" ]; then
  REPO_WITH_AUTH=$(echo "$GITHUB_REPO_URL" | sed "s|https://|https://$GITHUB_TOKEN@|")
  git remote remove github 2>/dev/null || true
  git remote add github "$REPO_WITH_AUTH"
  git push github HEAD:main --force
  git remote remove github
  echo "Pushed to GitHub successfully."
else
  echo "Skipping GitHub push: GITHUB_TOKEN or GITHUB_REPO_URL not set."
fi

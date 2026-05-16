#!/usr/bin/env bash
# Tag a new release: validate state, bump versions, commit, tag, push.
# The actual build and GitHub release are handled by the CD workflow.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

# --- Validate arguments ---

BUMP_TYPE="${1:-}"
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: scripts/tag-release.sh <patch|minor|major>"
  echo ""
  echo "Bumps all workspace versions, commits, tags, and pushes."
  echo "The CD workflow handles building and publishing the release."
  exit 1
fi

# --- Check branch ---

BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: releases must be from main (currently on $BRANCH)."
  exit 1
fi

# --- Check for clean working tree ---

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# --- Check remote is up to date ---

git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "Error: local main is not up to date with origin/main. Pull first."
  exit 1
fi

# --- Determine current version from latest tag ---

LATEST_TAG=$(git tag --sort=-v:refname | head -1)
if [ -z "$LATEST_TAG" ]; then
  echo "No existing tags found. This will be the first release."
  CURRENT=$(node -p "require('./package.json').version")
else
  CURRENT="${LATEST_TAG#v}"
  if [[ ! "$CURRENT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: latest tag $LATEST_TAG is not valid semver (got $CURRENT)."
    exit 1
  fi

  COMMITS=$(git log "$LATEST_TAG..HEAD" --oneline)
  if [ -z "$COMMITS" ]; then
    echo "Nothing to release: no commits since $LATEST_TAG."
    exit 1
  fi
fi

# --- Calculate new version ---

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "Releasing v$NEW_VERSION ($BUMP_TYPE bump from $CURRENT)"

# --- Bump all package.json versions (root + workspaces) ---

npm version "$NEW_VERSION" --no-git-tag-version --include-workspace-root --workspaces

# --- Commit, tag, push ---

git add package.json */package.json package-lock.json
git commit -m "chore: release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"
git push --follow-tags

echo ""
echo "Tagged v$NEW_VERSION and pushed to origin."
echo "The CD workflow will build the DMG and publish the release."

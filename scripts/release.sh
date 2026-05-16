#!/usr/bin/env bash
# Don't run this directly. Use /release in pi-coding-agent, which orchestrates
# the full flow: changelog review, bump confirmation, this script, and
# the GitHub release draft.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

cleanup() {
  if [[ $? -ne 0 ]]; then
    echo "Release failed. Restoring working tree..."
    git checkout -- .
  fi
}
trap cleanup EXIT

# --- Validate arguments ---

BUMP_TYPE="${1:-}"
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: scripts/release.sh <patch|minor|major>"
  exit 1
fi

# --- Check branch ---

BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: releases must be from main (currently on $BRANCH)."
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

# --- Check for clean working tree ---

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# --- Check for commits since last tag ---

LATEST_TAG=$(git tag --sort=-v:refname | head -1)
if [ -z "$LATEST_TAG" ]; then
  # First release: use initial commit as base
  echo "No existing tags found. This will be the first release."
  CURRENT="0.0.0"
  COMMITS=$(git log --oneline)
else
  CURRENT="${LATEST_TAG#v}"
  if [[ ! "$CURRENT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: latest tag $LATEST_TAG is not valid semver (got $CURRENT)."
    exit 1
  fi

  PKG_VERSION=$(node -p "require('./package.json').version")
  if [[ "$CURRENT" != "$PKG_VERSION" ]]; then
    echo "Error: latest tag ($CURRENT) doesn't match package.json ($PKG_VERSION)."
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

# --- Run tests and lint ---

echo "Running tests and lint..."
npm test
npm run lint

# --- Bump all package.json versions (root + workspaces) ---

PKG_VERSION=$(node -p "require('./package.json').version")
if [[ "$PKG_VERSION" != "$NEW_VERSION" ]]; then
  npm version "$NEW_VERSION" --no-git-tag-version --include-workspace-root --workspaces
else
  echo "All packages already at $NEW_VERSION, skipping bump."
fi

# --- Build distribution ---

echo "Running npm run dist..."
npm run dist

# --- Verify DMG ---

DMG="desktop/dist/PiFleet-$NEW_VERSION-arm64.dmg"
if [[ ! -f "$DMG" ]]; then
  echo "Error: expected DMG not found at $DMG"
  echo "Contents of desktop/dist:"
  ls -la desktop/dist/ || true
  exit 1
fi

# --- Commit, tag, push ---

git add package.json */package.json package-lock.json
git diff --cached --quiet || git commit -m "chore: release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"
git push --follow-tags

echo ""
echo "Released v$NEW_VERSION"
echo "DMG: $DMG"
echo ""
echo "Commits in this release:"
echo "$COMMITS"

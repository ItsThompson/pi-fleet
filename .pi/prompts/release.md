# Release

Create a new PiFleet release: review changes, run the release script, and create a draft GitHub release.

## Steps

### 1. Review changes since last tag

Run `git tag --sort=-v:refname | head -1` to get the latest tag, then `git log <latest-tag>..HEAD --oneline` to list all commits since that tag. If no tags exist, use `git log --oneline` for all commits.

Summarize the changes into categorized groups based on conventional commit prefixes (feat, fix, refactor, test, chore). Determine the bump type automatically:

- `patch`: only fixes, chores, refactors, or test changes (no new features)
- `minor`: at least one `feat` commit
- `major`: breaking changes or a fundamental shift in the project

Present the summary and your chosen bump type to the user for confirmation before proceeding.

If there are no commits since the last tag, stop and tell the user there is nothing to release.

### 2. Run the release script

Run `scripts/release.sh <patch|minor|major>` with the confirmed bump type. The script handles everything: version bump in root `package.json`, workspace version sync, build, commit, tag, and push.

If the script fails, stop and show the error. Do not proceed to the release step.

### 3. Create draft GitHub release

Compose the release using this pattern:

**Release title**: `PiFleet v{new_version}: {Short Title}`

- For minor/major releases: join the main feature names with commas and "and" (e.g., "Pods, Clusters, and Attention System", "Terminal Opener Fixes and Rich Metadata")
- For patch releases: brief description of the fix (e.g., "Fix pod state aggregation")

**Release body**:

- Open with a short intro paragraph (1-2 sentences) summarizing the release theme
- Group changes into sections with `**Bold Section Header**` followed by bullet points
- For minor/major releases: use feature-oriented sections (e.g., **Pods**, **Clusters**, **Terminal**, **Attention**, **Fixes**, **Quality**)
- For patch releases: use a short paragraph followed by a single `**Bug Fix**` section with bullets
- Write bullets from the user's perspective: describe what changed, not how the code works internally
- Omit chore/refactor commits unless they have user-visible impact

Draft the release title and body, present them to the user for review, and confirm before creating.

Create the release:

```bash
gh release create v{new_version} \
  --title "PiFleet v{new_version}: {Short Title}" \
  --notes "{release_body}" \
  --draft \
  desktop/dist/PiFleet-{new_version}-arm64.dmg
```

Tell the user the draft release URL so they can review and publish it.

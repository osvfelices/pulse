#!/bin/bash
#
# Cleanup GitHub Actions Workflow Runs
#
# This script deletes all workflow runs from the repository
# Uses GitHub CLI (gh) - install with: brew install gh
#

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  GitHub Actions Cleanup Script                                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
  echo "ERROR: GitHub CLI (gh) is not installed"
  echo ""
  echo "Install it with:"
  echo "  macOS:   brew install gh"
  echo "  Linux:   https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
  echo ""
  exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
  echo "ERROR: Not authenticated with GitHub CLI"
  echo ""
  echo "Run: gh auth login"
  echo ""
  exit 1
fi

echo "→ Fetching workflow runs..."
echo ""

# Get all workflow runs
runs=$(gh run list --limit 1000 --json databaseId --jq '.[].databaseId')

if [ -z "$runs" ]; then
  echo "No workflow runs found."
  exit 0
fi

count=$(echo "$runs" | wc -l | tr -d ' ')
echo "Found $count workflow runs"
echo ""

read -p "Delete all $count workflow runs? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "→ Deleting workflow runs..."
echo ""

deleted=0
failed=0

for run_id in $runs; do
  if gh run delete "$run_id" --yes &> /dev/null; then
    deleted=$((deleted + 1))
    echo "  ✓ Deleted run $run_id ($deleted/$count)"
  else
    failed=$((failed + 1))
    echo "  ✗ Failed to delete run $run_id"
  fi
done

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Cleanup Complete                                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Deleted: $deleted"
echo "Failed:  $failed"
echo ""

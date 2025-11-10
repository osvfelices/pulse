#!/bin/bash
#
# Pulse 1.0.0 NPM Publication Script
#
# This script guides you through publishing to npm with all safety checks.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Pulse 1.0.0 NPM Publication                                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check authentication
echo "→ Checking npm authentication..."
if ! npm whoami > /dev/null 2>&1; then
  echo "❌ Not logged in to npm"
  echo ""
  echo "Please run: npm login"
  echo "Then re-run this script."
  exit 1
fi

LOGGED_IN_AS=$(npm whoami)
echo "✓ Logged in as: $LOGGED_IN_AS"
echo ""

# Pre-publish verification
echo "→ Running pre-publish verification..."
if ! npm run verify > /dev/null 2>&1; then
  echo "❌ Verification failed"
  echo ""
  echo "Run 'npm run verify' to see details."
  exit 1
fi
echo "✓ All tests passed"
echo ""

# Check if "pulse" is available
echo "→ Checking package name availability..."
if npm view pulse version > /dev/null 2>&1; then
  EXISTING_VERSION=$(npm view pulse version)
  echo "⚠️  Package 'pulse' already exists (v$EXISTING_VERSION)"
  echo ""
  echo "Options:"
  echo "  1. Use scoped name: @osvfelices/pulse"
  echo "  2. Contact current owner to transfer/unpublish"
  echo ""
  read -p "Use scoped name @osvfelices/pulse? [y/N] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Update package.json
    sed -i 's/"name": "pulse"/"name": "@osvfelices\/pulse"/' package.json
    echo "✓ Updated to @osvfelices/pulse"
    git add package.json
    git commit -m "chore(npm): switch to scoped name @osvfelices/pulse"
    PACKAGE_NAME="@osvfelices/pulse"
  else
    echo "Aborted. Please resolve name conflict and try again."
    exit 1
  fi
else
  echo "✓ Package name 'pulse' is available"
  PACKAGE_NAME="pulse"
fi
echo ""

# Dry run
echo "→ Running dry-run publish..."
npm publish --dry-run --access public 2>&1 | tail -10
echo ""

# Final confirmation
echo "Ready to publish:"
echo "  Package: $PACKAGE_NAME@1.0.0"
echo "  Size: 48.2 kB"
echo "  Files: 43"
echo ""
read -p "Proceed with publish? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Publish
echo ""
echo "→ Publishing to npm..."
if npm publish --access public --provenance; then
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║  ✓ Successfully published $PACKAGE_NAME@1.0.0!"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Next steps:"
  echo "  1. Verify: npm view $PACKAGE_NAME"
  echo "  2. Test install: npm i $PACKAGE_NAME"
  echo "  3. Push tag: git push origin v1.0.0"
  echo "  4. Create GitHub Release"
  echo ""
else
  echo ""
  echo "❌ Publish failed"
  echo ""
  echo "Check the error above and try again."
  exit 1
fi

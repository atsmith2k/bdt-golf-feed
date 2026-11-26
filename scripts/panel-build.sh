#!/usr/bin/env bash
# bash scripts/panel-build.sh
#
# The ash10 panel's build command. The same steps as `npm ci && npm run build`,
# plus two things that matter on the VM:
#
#   - npm's download cache lives in the panel's persistent $BUILD_CACHE_DIR, so
#     `npm ci` unpacks from disk instead of downloading ~400 packages on every
#     deploy (that download was about a minute of each 90 second deploy).
#   - the release keeps only what `next start` needs: devDependencies and the
#     webpack build cache are removed after the build. The panel keeps five
#     releases, and each one carried all of it.
set -euo pipefail

started=$(date +%s)
step() { echo "==> [panel-build] $1 ($(($(date +%s) - started))s)"; }

npm_cache=()
if [ -n "${BUILD_CACHE_DIR:-}" ] && mkdir -p "$BUILD_CACHE_DIR/npm" 2>/dev/null; then
  npm_cache=(--cache "$BUILD_CACHE_DIR/npm" --prefer-offline)
  step "npm cache at $BUILD_CACHE_DIR/npm"
else
  step "no persistent cache directory; installing from the registry"
fi

npm ci --no-audit --no-fund ${npm_cache[@]+"${npm_cache[@]}"}
step "dependencies installed"

npm run build
step "built"

npm prune --omit=dev --no-audit --no-fund ${npm_cache[@]+"${npm_cache[@]}"}
rm -rf .next/cache
step "release trimmed to $(du -sh . 2>/dev/null | cut -f1)"

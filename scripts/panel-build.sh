#!/usr/bin/env bash
# bash scripts/panel-build.sh
#
# The ash10 panel's build command. The same steps as `npm ci && npm run build`,
# plus what matters on the VM:
#
#   - Next's build cache lives in the panel's persistent $BUILD_CACHE_DIR, so
#     unchanged code is not recompiled (about 15 seconds of each deploy). npm's
#     download cache is kept there too.
#   - the release keeps only what `npm start` needs. The build leaves a
#     self-contained server in .next/standalone, so node_modules (about 500 MB)
#     and the build cache are deleted afterwards. The panel keeps five
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

# Next's build cache (webpack and TypeScript incremental state) also lives in
# the persistent directory, linked into place for the build only.
next_cache=""
if [ ${#npm_cache[@]} -gt 0 ] && mkdir -p "$BUILD_CACHE_DIR/next-cache" .next 2>/dev/null; then
  next_cache="$BUILD_CACHE_DIR/next-cache"
  rm -rf .next/cache
  ln -s "$next_cache" .next/cache
fi

npm run build
step "built"

# `npm start` runs .next/standalone/server.js, which carries the node_modules
# files it needs. Check it is there before deleting the full install.
test -f .next/standalone/server.js
rm -rf node_modules
# Remove the link (or, without a persistent directory, the cache itself).
rm -rf .next/cache
step "release trimmed: standalone $(du -sh .next/standalone 2>/dev/null | cut -f1), release $(du -sh . 2>/dev/null | cut -f1)${next_cache:+, build cache $(du -sh "$next_cache" 2>/dev/null | cut -f1)}"

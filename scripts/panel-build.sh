#!/usr/bin/env bash
# bash scripts/panel-build.sh
#
# The ash10 panel's build command. The same result as `npm ci && npm run build`,
# arranged for the VM, where disk is slow and the panel keeps five releases:
#
#   - the release keeps only what `npm start` needs. The build leaves a
#     self-contained server in .next/standalone, so the full node_modules
#     (about 500 MB) does not stay in the release.
#   - instead node_modules is parked in the panel's persistent $BUILD_CACHE_DIR
#     and moved back in for the next build, so `npm ci` (about 25 seconds) runs
#     only when package-lock.json or the Node version changes.
#   - Next's build cache and npm's download cache live there too.
#
# Without $BUILD_CACHE_DIR it is a plain install and build.
set -euo pipefail

started=$(date +%s)
step() { echo "==> [panel-build] $1 ($(($(date +%s) - started))s)"; }

cache=""
if [ -n "${BUILD_CACHE_DIR:-}" ] && mkdir -p "$BUILD_CACHE_DIR/npm" "$BUILD_CACHE_DIR/next-cache" 2>/dev/null; then
  cache="$BUILD_CACHE_DIR"
fi

# One parked install per lockfile + Node version.
parked=""
if [ -n "$cache" ]; then
  key=$( (cat package-lock.json; node --version) | sha256sum | cut -c1-16)
  parked="$cache/node_modules-$key"
fi

# Park the install again however the build ends, so a failed build does not
# cost the next one a full install. Only a complete install is ever parked.
installed=""
park() {
  if [ -n "$installed" ] && [ -n "$parked" ] && [ -d node_modules ] && [ ! -e "$parked" ]; then
    mv node_modules "$parked" 2>/dev/null || true
  fi
  rm -rf node_modules
}
trap park EXIT

if [ -n "$parked" ] && [ -d "$parked" ] && mv "$parked" node_modules; then
  installed=1
  step "reused the parked node_modules (lockfile unchanged)"
else
  rm -rf node_modules
  if [ -n "$cache" ]; then
    npm ci --no-audit --no-fund --cache "$cache/npm" --prefer-offline
  else
    npm ci --no-audit --no-fund
  fi
  installed=1
  step "dependencies installed"
fi

# Next's build cache, linked into place for the build only.
if [ -n "$cache" ]; then
  mkdir -p .next
  rm -rf .next/cache
  ln -s "$cache/next-cache" .next/cache
fi

npm run build
step "built"

# `npm start` runs .next/standalone/server.js, which carries the node_modules
# files it needs. Check it is there before the full install leaves.
test -f .next/standalone/server.js

# Remove the link (or, without a persistent directory, the cache itself).
rm -rf .next/cache

if [ -n "$cache" ]; then
  # Installs for older lockfiles are no longer needed.
  for old in "$cache"/node_modules-*; do
    if [ -e "$old" ] && [ "$old" != "$parked" ]; then rm -rf "$old"; fi
  done
fi
park
trap - EXIT

step "release trimmed: standalone $(du -sh .next/standalone 2>/dev/null | cut -f1), release $(du -sh . 2>/dev/null | cut -f1)${cache:+, cache $(du -sh "$cache" 2>/dev/null | cut -f1)}"

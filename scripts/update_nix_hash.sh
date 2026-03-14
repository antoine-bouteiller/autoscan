#!/usr/bin/env bash
set -euo pipefail

FLAKE_FILE="flake.nix"
FAKE_HASH="sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

current_hash=$(sed -n 's/.*hash = "\([^"]*\)".*/\1/p' "$FLAKE_FILE" | head -1)

sed -i.bak "s|hash = \"$current_hash\"|hash = \"$FAKE_HASH\"|" "$FLAKE_FILE"
rm -f "$FLAKE_FILE.bak"

build_output=$(nix build .#autoscan 2>&1 || true)
real_hash=$(echo "$build_output" | sed -n 's/.*got: *\(sha256-[^ ]*\).*/\1/p' | head -1)

if [ -z "$real_hash" ]; then
  sed -i.bak "s|hash = \"$FAKE_HASH\"|hash = \"$current_hash\"|" "$FLAKE_FILE"
  rm -f "$FLAKE_FILE.bak"
  echo "Failed to determine pnpm deps hash, restored previous hash"
  echo "Nix build output:"
  echo "$build_output"
  exit 1
fi

sed -i.bak "s|hash = \"$FAKE_HASH\"|hash = \"$real_hash\"|" "$FLAKE_FILE"
rm -f "$FLAKE_FILE.bak"

if [ "$current_hash" != "$real_hash" ]; then
  echo "Updated pnpmDeps hash: $real_hash"
else
  echo "pnpmDeps hash unchanged"
fi

#!/usr/bin/env bash
set -euo pipefail

FLAKE_FILE="flake.nix"
FAKE_HASH="sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

current_hash=$(
  awk '
    /pnpmDeps = pkgs.fetchPnpmDeps/ { in_pnpm_deps = 1 }
    in_pnpm_deps && /hash = "/ {
      sub(/.*hash = "/, "")
      sub(/".*/, "")
      print
      exit
    }
  ' "$FLAKE_FILE"
)

awk -v fake_hash="$FAKE_HASH" '
  /pnpmDeps = pkgs.fetchPnpmDeps/ { in_pnpm_deps = 1 }
  in_pnpm_deps && /hash = "/ && ! updated {
    sub(/hash = "[^"]*"/, "hash = \"" fake_hash "\"")
    updated = 1
  }
  { print }
' "$FLAKE_FILE" >"$FLAKE_FILE.tmp"
mv "$FLAKE_FILE.tmp" "$FLAKE_FILE"
rm -f "$FLAKE_FILE.bak"

nix flake update nixpkgs

build_log=$(mktemp)
nix build .#autoscan --log-format raw >"$build_log" 2>&1 || true
real_hash=$(sed 's/\x1b\[[0-9;]*m//g' "$build_log" | sed -n 's/.*got: *\(sha256-[^ ]*\).*/\1/p' | head -1)

if [ -z "$real_hash" ]; then
  awk -v current_hash="$current_hash" '
    /pnpmDeps = pkgs.fetchPnpmDeps/ { in_pnpm_deps = 1 }
    in_pnpm_deps && /hash = "/ && ! restored {
      sub(/hash = "[^"]*"/, "hash = \"" current_hash "\"")
      restored = 1
    }
    { print }
  ' "$FLAKE_FILE" >"$FLAKE_FILE.tmp"
  mv "$FLAKE_FILE.tmp" "$FLAKE_FILE"
  echo "Failed to determine pnpm deps hash, restored previous hash"
  echo "Nix build output:"
  cat "$build_log"
  rm -f "$build_log"
  exit 1
fi
rm -f "$build_log"

awk -v real_hash="$real_hash" '
  /pnpmDeps = pkgs.fetchPnpmDeps/ { in_pnpm_deps = 1 }
  in_pnpm_deps && /hash = "/ && ! updated {
    sub(/hash = "[^"]*"/, "hash = \"" real_hash "\"")
    updated = 1
  }
  { print }
' "$FLAKE_FILE" >"$FLAKE_FILE.tmp"
mv "$FLAKE_FILE.tmp" "$FLAKE_FILE"

if [ "$current_hash" != "$real_hash" ]; then
  echo "Updated pnpmDeps hash: $real_hash"
else
  echo "pnpmDeps hash unchanged"
fi

#!/usr/bin/env bash
# Refreshes the release hashes in nix/bun.json for its current version.
set -euo pipefail

file="$(dirname "$0")/../nix/bun.json"
version=$(jq -r .version "$file")

for system in $(jq -r '.sources | keys[]' "$file"); do
  asset=$(jq -r --arg s "$system" '.sources[$s].asset' "$file")
  url="https://github.com/oven-sh/bun/releases/download/bun-v$version/$asset.zip"
  hash=$(nix store prefetch-file --json "$url" | jq -r .hash)
  jq --arg s "$system" --arg h "$hash" '.sources[$s].hash = $h' "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
done

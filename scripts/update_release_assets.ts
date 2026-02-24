import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [_bin, _script, nextVersion] = process.argv

if (!nextVersion) {
  process.exit(1)
}

let flake = readFileSync('flake.nix', 'utf8')

flake = flake.replace(/version = ".*";/, `version = "${nextVersion}";`)

execSync('bun build ./src/index.ts ./migrations/**/*.sql --compile --target=bun-linux-x64 --outfile autoscan-linux-x64', { stdio: 'inherit' })

const hash = execSync('openssl dgst -sha256 -binary autoscan-linux-x64 | base64').toString().trim()

flake = flake.replace(/hash = ".*";/, `hash = "sha256-${hash}";`)

writeFileSync('flake.nix', flake)

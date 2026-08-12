# Autoscan

Media automation service integrating Radarr, Sonarr, Plex, and TMDB.

## Guidelines

Cross-cutting specs live in [docs/](../docs) — start with
[project_structure.spec.md](../docs/project_structure.spec.md). Feature specs are co-located with each feature
under `src/features/<feature>/<feature>.spec.md`.

## Runtime & packaging

- **Bun is the runtime and package manager.** Run the app with `bun src/index.ts`
  (`bun run dev` for watch mode) and manage dependencies with `bun install` /
  `bun add` / `bun remove`. The HTTP server uses `Bun.serve` and subprocesses use
  Effect's `ChildProcess` on the Bun spawner layer (`BunServices.layer`).
- **Lint and format use oxlint and oxfmt directly** — run `bun run check`
  (format check + lint + type-check), `bun run lint` (oxlint with `--fix`), and
  `bun run fmt` (oxfmt). Config lives in `oxlint.config.ts` and `oxfmt.config.ts`.
  The `--type-aware`/`--type-check` flags require the `oxlint-tsgolint` dependency
  (invoked by oxlint, not directly).
- **Tests run on Bun's native runner (`bun test`), not vitest.** Use `bun run test`
  (and `bun run test:coverage`). Import test APIs from `bun:test` (`describe`, `test`,
  `expect`, `spyOn`, `jest`, `mock`). Config lives in `bunfig.toml`: it preloads
  `tests/preload.ts` (starts the shared Postgres testcontainer, sets env) and
  `tests/setup.ts` (registers mock clients). Coverage thresholds are enforced by
  `scripts/coverage_gate.ts` since Bun's own threshold is per-file, not global.
- **Nix packaging uses [bun2nix](https://github.com/nix-community/bun2nix).** The
  `bun.nix` dependency manifest is regenerated from `bun.lock` by the `postinstall`
  script (`bunx bun2nix -o bun.nix`); commit it alongside `bun.lock`.

## Review Checklist for Agents

- [ ] Run `bun install` after pulling remote changes and before getting started.
- [ ] Run `bun run check` and `bun run test` to validate changes.

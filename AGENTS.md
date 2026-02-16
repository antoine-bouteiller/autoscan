# Autoscan

Media automation service integrating Radarr, Sonarr, Plex, and TMDB. Built with **Effect-TS** for type-safe dependency injection, error handling, and concurrency.

## Commands

```bash
bun dev        # Development with watch mode
bun test       # Run tests
bun run build  # Compile binary
bun lint       # Lint with oxlint
bun format     # Format with oxfmt
bun typecheck  # Type check
```

## Guidelines

- [Architecture](agents_doc/architecture.md)
- [Effect-TS Patterns](agents_doc/effect_patterns.md)

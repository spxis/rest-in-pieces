# AGENTS.md

## Local development

This project owns local ports 6800–6899 and opens nothing outside them.

- 6800 is the API (`pnpm dev:api`, `PORT` in `apps/api/src/server.ts`).
- 6801 is the playground (`pnpm dev:web`, `strictPort` in `apps/web/vite.config.ts`).
- Every other server, worktree or test run takes the next free port in the block. The Playwright servers default to 6820 (API), 6821 (playground), 6822 (an API with the session on) and 6823 (the GitHub Pages build); `E2E_API_PORT`, `E2E_WEB_PORT`, `E2E_SESSION_PORT` and `E2E_PAGES_PORT` move them. `pnpm pack:test` starts the packed CLI on the first free port of 6830–6839; `PACK_TEST_PORT` moves that range of ten.

Check that a port is free before using it:

```sh
lsof -iTCP:<port> -sTCP:LISTEN
```

## Versioning

Every feature or fix that lands on `main` takes its own version with `pnpm release <version>`, in the same push: a `feat` takes the next minor, a `fix` or `chore` the next patch, a breaking change the next major. Several may be pushed together, each with its own version, released in the order they landed; the push of the tags publishes them. Record each change under `## Unreleased` in `CHANGELOG.md` before releasing it. A change nothing a reader of the site or the package can see, such as a test, a CI step or a doc, takes no version and rides with the next release; `pnpm release` refuses an empty `## Unreleased` section anyway.

The version lives in the three `package.json` files and the changelog's latest dated section, and `pnpm release` moves all four; never edit them by hand. `apps/api/test/versions.test.ts` holds them together, and the playground's top bar reads `apps/api/package.json` through `define` in `apps/web/vite.config.ts` (plus the short commit SHA in the Pages build). [CONTRIBUTING.md](CONTRIBUTING.md#releasing) has the whole procedure.

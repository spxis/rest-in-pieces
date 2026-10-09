# AGENTS.md

## Local development

This project owns local ports 6800–6899 and opens nothing outside them.

- 6800 is the API (`pnpm dev:api`, `PORT` in `apps/api/src/server.ts`).
- 6801 is the playground (`pnpm dev:web`, `strictPort` in `apps/web/vite.config.ts`).
- Every other server, worktree or test run takes the next free port in the block. The Playwright servers default to 6820 (API) and 6821 (playground); `E2E_API_PORT` and `E2E_WEB_PORT` move them.

Check that a port is free before using it:

```sh
lsof -iTCP:<port> -sTCP:LISTEN
```

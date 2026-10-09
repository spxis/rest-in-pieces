# Contributing

Thanks for helping improve REST in Pieces. Changes should keep generated data reproducible and preserve documented behaviour; existing URLs and query parameters are a public contract.

## Local setup

Requirements: Node.js 22.18 or later (24 LTS recommended) and pnpm 10.

```sh
pnpm install
pnpm dev        # API on :6800, playground on :6801
```

`PORT` moves the API. `VITE_API_BASE_URL` points the playground at another API.

Local ports come from this project's block, 6800–6899; [AGENTS.md](AGENTS.md) says which is which and how to pick a free one for a worktree.

## Project layout

| Path | Contents |
| ---- | -------- |
| `apps/api/src/lib` | The collection pipeline, filtering, sorting, formats and response simulation |
| `apps/api/src/data` | Dataset generators, the generator registry and the dataset cache |
| `apps/api/src/routes` | Route definitions; each route declares its Zod schemas for validation and OpenAPI |
| `apps/api/src/resources.ts` | The list of built-in datasets. Adding one here gives it list, item, docs and playground support |
| `apps/web/src` | The playground: `lib` (pure logic), `hooks`, `components` |
| `tests/e2e` | Playwright tests against the real API and playground |

## Before opening a pull request

```sh
pnpm check              # lint, typecheck, unit tests, build
pnpm test:coverage      # API coverage thresholds
pnpm exec playwright install chromium
pnpm test:e2e
```

Keep pull requests focused, add or update tests for behaviour changes, and update the README and changelog when user-facing behaviour changes.

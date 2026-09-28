# Contributing

Thanks for helping improve REST in Pieces. Changes should keep generated data reproducible and preserve the API's documented behavior.

## Local setup

Requirements: Node.js 22.18 or later and pnpm 10.33.0.

```sh
pnpm install
pnpm dev
```

## Before opening a pull request

Run the checks that cover your change:

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

Keep pull requests focused, add or update tests for behavior changes, and update the README or changelog when user-facing behavior changes.
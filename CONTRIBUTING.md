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

## Previewing the GitHub Pages build

The live demo is a separate build of the playground with the whole API inside it. To check it before it is published:

```sh
pnpm --filter @rest-in-pieces/web build:pages
pnpm --filter @rest-in-pieces/web exec vite preview --mode pages --port 6802 --strictPort
```

Then open [http://localhost:6802/rest-in-pieces/](http://localhost:6802/rest-in-pieces/). `--mode pages` makes the preview serve `apps/web/dist-pages` under `/rest-in-pieces/`, the paths the build was made for; without it the page loads but its scripts do not. The API reference is at `api/docs/` beside it. Take another free port in the block if 6802 is in use.

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

## Releasing

Every feature or fix that lands on `main` takes its own version, in the same push. Record the change under `## Unreleased` in `CHANGELOG.md`, merge it, then run `pnpm release` with the next version by the kind of change:

| Change | Version | Example from 2.2.0 |
| ------ | ------- | ------------------ |
| `feat` | next minor | 2.3.0 |
| `fix` or `chore` | next patch | 2.2.1 |
| breaking change | next major | 3.0.0 |

Several changes may be pushed together, each with its own `pnpm release` and version, in the order they landed. The push of the tags publishes them. A change nothing a reader of the site or the package can see, such as a test, a CI step or a doc, takes no version and rides with the next release; `pnpm release` refuses an empty `## Unreleased` section anyway. The playground's top bar shows the version (and, on GitHub Pages, the commit), and `apps/api/test/versions.test.ts` fails when the three `package.json` files or the changelog's latest release disagree.

Releases are cut from an up-to-date `main` with one command:

```sh
pnpm release 2.2.0
git push origin main
git push origin v2.2.0
```

`pnpm release` refuses a dirty tree, a branch other than `main`, and a version that is not valid semver or not greater than the current one. It sets the version in the three `package.json` files, moves the Unreleased entries under `## 2.2.0 - <today>`, commits `chore(release): 2.2.0` and creates the tag `v2.2.0`. It pushes nothing; it prints the two commands above.

Pushing the tag starts `.github/workflows/release.yml`, which:

1. checks that the tag matches `package.json` and that `CHANGELOG.md` has a section for it;
2. runs the same checks as CI;
3. pushes the Docker image to `ghcr.io/spxis/rest-in-pieces` for amd64 and arm64, tagged with the version and, unless it is a prerelease such as `2.2.0-rc.1`, `latest`;
4. publishes the npm package with provenance;
5. creates the GitHub release, with that version's changelog section as its notes.

Publishing to npm needs an `NPM_TOKEN` repository secret, which only the owner can add. Without it the workflow skips the npm step with a notice and the rest of the release goes ahead.

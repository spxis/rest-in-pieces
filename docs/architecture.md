# Architecture

```mermaid
flowchart LR
  subgraph web["apps/web · React 19 + Vite 8"]
    UI[Playground] -->|fetch| API
  end
  subgraph api["apps/api · Hono on Node 24"]
    API[Routes] --> SIM[Simulation<br/>delay · trickle · status · fail]
    SIM --> COL[Collection pipeline<br/>filter → sort → max → page]
    COL --> REL[Relations<br/>nested routes · expand]
    COL --> FMT[Formats<br/>JSON · CSV · YAML · XML · NDJSON · SQL]
    COL --> DATA[(Seeded datasets<br/>Faker, LRU cache)]
    API --> IMG[SVG avatars and placeholders]
    API --> DOCS[OpenAPI 3.1 + Scalar]
  end
```

- **One pipeline.** Every collection, built-in or generated, goes through the same filter, sort, cap and page steps, so behaviour is identical everywhere.
- **Schemas first.** Routes are declared with Zod through `@hono/zod-openapi`; the OpenAPI document is generated from them and cannot drift from the code.
- **Deterministic by construction.** Datasets depend only on their seed, and the most recently used ones are cached in memory.
- **No build step for the API.** Node runs the TypeScript directly with type stripping.
- **Runs anywhere fetch does.** `createApp()` in `apps/api/src/core.ts` uses only web standards. `app.ts` adds the Node parts (logging and static files), and the GitHub Pages build loads the same app into the browser tab.

```
apps/api     Hono API: routes, collection pipeline, datasets, OpenAPI
apps/web     React playground: components, hooks, request builder
tests/e2e    Playwright tests that drive the playground against the real API
```

The shared site reads this repository’s guides and changelog alongside the public SDK in `apps/api`. Generated type comments live in their authoritative writer, `apps/api/scripts/docs-openapi.ts`; builds and example checks retain the native TypeScript 7 CLI. [Architecture and limits](docs/guides/architecture-and-limits.md) explains the entry and measurement boundaries.

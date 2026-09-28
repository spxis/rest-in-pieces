# REST in Pieces

A repeatable test backend for frontend development. Build tables, pagination, sorting, loading states, empty states, and error handling against realistic data before a real backend exists.

The data is generated from a fixed seed. The same request returns the same records across machines and restarts, so a bug can be reproduced from its URL instead of disappearing with a new random dataset.

## Built for repeatable frontend testing

- Keep a fixed seed while changing pages, sort order, and dataset size.
- Set a small maximum to test the last page and end-of-data behavior.
- Simulate slow responses and common failure statuses without changing your client.
- Share a complete playground setup link, or copy the exact request as a URL or `curl` command.
- Inspect response bodies, headers, status, size, and duration in one place.

![REST in Pieces API playground](docs/images/playground.png)

## Quick start

Requires Node.js 22.18+ (24 LTS recommended) and pnpm.

```sh
pnpm install
pnpm dev          # API: http://localhost:6800, playground: http://localhost:6801
```

| Script           | What it does                        |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | Start the API and playground        |
| `pnpm dev:api`   | Start the API on port 6800          |
| `pnpm dev:web`   | Start the playground on port 6801   |
| `pnpm start`     | Start the API                       |
| `pnpm build`     | Build the playground for production |
| `pnpm test`      | Run the test suite                  |
| `pnpm typecheck` | Type-check every workspace          |
| `pnpm lint`      | Lint and check formatting (Biome)   |
| `pnpm format`    | Apply lint fixes and formatting     |
| `pnpm test:e2e`  | Run the browser playground smoke test |

Set `PORT` to change the API port. Set `VITE_API_BASE_URL` to point the playground at a different API origin.

## Playground

The request builder is available at [http://localhost:6801](http://localhost:6801) after `pnpm dev`. Choose a repeatable scenario such as **Next page**, **End of results**, **Slow response**, or **503 error**, then inspect or share the generated request. The builder also supports names, countries, and custom generation endpoints, response formats, and simulation controls. Requests are sent only when you choose **Send request**.

The API runs separately at [http://localhost:6800](http://localhost:6800), with interactive documentation at [http://localhost:6800/docs](http://localhost:6800/docs).

## Deploy

### Vercel

Create two Vercel projects connected to this repository:

| Project | Root Directory | Framework |
| ------- | -------------- | --------- |
| API | `apps/api` | Hono |
| Playground | `apps/web` | Vite |

Set `VITE_API_BASE_URL` in the Playground project's environment variables to the API project's origin, then redeploy the Playground. The API allows cross-origin requests for the Playground.

### Docker

Build and run the combined API and Playground image:

```sh
REST_IN_PIECES_DIR=/absolute/path/to/rest-in-pieces
docker build --tag rest-in-pieces --file "$REST_IN_PIECES_DIR/Dockerfile" "$REST_IN_PIECES_DIR"
docker run --rm --publish 6800:6800 rest-in-pieces
```

The Playground and API are then available from port 6800. Set `PORT` when running the container to listen on a different container port, and publish that port from Docker accordingly.

## API

### `GET /names`

Also available at `/random-names`. Returns fake people:

```json
{
  "metadata": {
    "count": 2,
    "total": 1000,
    "timestamp": "1790570600275",
    "lastUpdated": "2026-09-28T04:43:20.275Z",
    "output": { "results": "results" },
    "version": "2.0.0",
    "parameters": { "size": 2, "offset": 0, "max": 1000, "sortBy": null, "sortType": "string", "sortDirection": "asc" }
  },
  "results": [
    { "index": 0, "name": "…", "age": 34, "address": "…", "city": "…", "province": "…", "postal": "…", "country": "CA", "gender": "female" }
  ]
}
```

| Parameter       | Aliases                      | Default   | Description |
| --------------- | ---------------------------- | --------- | ----------- |
| `limit`         | `size`, `length`             | `10`      | Records per page (max 1000). |
| `offset`        |                              | `0`       | Records to skip. |
| `max`           | `maxRecords`                 | `1000`    | Caps the size of the dataset, useful for testing end-of-data handling. |
| `sortBy`        | `sortby`, `sortField`        | none      | Field to sort by. Append `:numeric` to compare as numbers, e.g. `age:numeric`. |
| `sortDirection` | `sortOrder`, `sortdirection` | `asc`     | `desc`, `descending`, `reverse`, `rev`, `backwards` or `-1` sort descending. |
| `metadata`      |                              | on        | `0` or `false` returns the bare array. |
| `resultsName`   |                              | `results` | Renames the results key, e.g. `rows`. |
| `seed`          |                              | `1`       | Selects a repeatable dataset. |
| `format`        |                              | `json`    | `csv`, `yaml`, or `xml`; also negotiated from `Accept`. |
| `delay`         |                              | `0`       | Adds a response delay in milliseconds (maximum `10000`). |
| `status`        |                              | unchanged | Overrides the response status code. |
| `fail`          |                              | off       | Returns a simulated error response when true. |

Examples:

```
/names?offset=5&limit=5
/names?max=25&offset=20&limit=10
/names?sortBy=name&sortDirection=desc
/names?metadata=false
/names?resultsName=rows
/names?seed=42&format=csv
/names?delay=500&status=503
/names?fail=true
```

### `GET /countries`

Returns every country with ISO codes, currencies, languages and calling codes. Accepts `limit`, `offset`, `seed`, and the response simulation and format options above.

### `GET /generate`

Generates a custom dataset from comma-separated `field:generatorType` pairs. Supports `limit`, `offset`, `max`, `sortBy`, `sortDirection`, `seed`, and the response format and simulation options.

```
/generate?fields=name:person.fullName,email:internet.email&limit=10&seed=42
/generate?fields=city:location.city,company:company.name&sortBy=city
```

Unknown generator types and malformed field lists return `400`.

### `GET /generators`

Lists every supported generator type for use with `/generate`.

### API documentation

The OpenAPI 3.1 document is available at [`/openapi.json`](http://localhost:6800/openapi.json), with interactive Swagger UI at [`/docs`](http://localhost:6800/docs).

### `GET /health`

Returns `{ "status": "ok" }`.

## Project layout

```
apps/api     Hono API (TypeScript, runs directly on Node)
apps/web     React and Vite API playground
```

## License

MIT © 2014–2026 SPX Interactive Software

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and checks. Security issues should be reported privately as described in [SECURITY.md](SECURITY.md).

# REST in Pieces

A small REST service that serves realistic, repeatable fake data, so you can build and test client applications (tables, paging, sorting, infinite scroll, empty and end-of-data states) before a real backend exists.

The data is generated from a fixed seed. The same request always returns the same records, on any machine and after any restart.

## Quick start

Requires Node.js 22.18+ (24 LTS recommended) and pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:8080
```

| Script           | What it does                        |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | Start the API with file watching    |
| `pnpm start`     | Start the API                       |
| `pnpm test`      | Run the test suite                  |
| `pnpm typecheck` | Type-check every workspace          |
| `pnpm lint`      | Lint and check formatting (Biome)   |
| `pnpm format`    | Apply lint fixes and formatting     |

Set `PORT` to change the port.

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

Examples:

```
/names?offset=5&limit=5
/names?max=25&offset=20&limit=10
/names?sortBy=name&sortDirection=desc
/names?metadata=false
/names?resultsName=rows
```

### `GET /countries`

Returns every country with ISO codes, currencies, languages and calling codes. Accepts `limit` and `offset`.

### `GET /health`

Returns `{ "status": "ok" }`.

## Project layout

```
apps/api     Hono API (TypeScript, runs directly on Node)
```

## License

MIT © 2014–2026 SPX Interactive Software

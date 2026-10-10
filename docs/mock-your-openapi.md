# Mock your own API from its OpenAPI document

`rest-in-pieces serve --openapi ./openapi.yaml` answers every operation of your OpenAPI document with realistic, seeded data in the shape of its response schema, checks each request against the document, and takes the same `delay`, `status`, `fail` and `trickle` controls as the built-in datasets. Build the frontend against the contract before the backend exists, or while it is down. [Back to the README.](https://github.com/spxis/rest-in-pieces#readme)

```sh
npx @johnmorrisdotca/rest-in-pieces serve --openapi ./openapi.yaml
# or, with the same effect, on the main command
npx @johnmorrisdotca/rest-in-pieces --openapi ./openapi.yaml --port 6900
```

```
REST in Pieces 2.19.2
Mocking Pet shop 1.2.0 from ./openapi.yaml: 5 operations at http://localhost:6800
  GET     /pets  -> 200
  POST    /pets  -> 201
  GET     /owners  -> 200
  GET     /pets/{petId}  -> 200
  DELETE  /pets/{petId}  -> 204
Every route answers with seeded data in the shape of its response schema, and checks the request against the document.
Controls on any route: ?delay=1500  ?status=503  ?fail=0.3  ?trickle=200  ?seed=7  ?locale=ja
GET http://localhost:6800/__mock lists the operations; http://localhost:6800/__mock/docs shows the document.
```

```sh
curl http://localhost:6800/pets/3
# {"name":"Tommie Mosciski","tag":"vitae condico reiciendis","id":3,"status":"available"}

curl 'http://localhost:6800/pets?limit=2'          # a list the length the operation's own `limit` asks for
curl http://localhost:6800/pets/seven              # 400, naming the parameter that is not an integer
curl 'http://localhost:6800/pets/3?status=404'     # the 404 body your document describes
```

The document is OpenAPI 3.0, 3.1 or Swagger 2.0, as JSON or YAML (`.yaml`, `.yml` or anything else is read as JSON), up to 5 MB.

## What an operation answers

- **A body that matches the schema.** The answer is the operation's lowest `2xx` response (`200` before `201`; a `2XX` range or `default` when that is all there is), made from its schema by the generator behind [`POST /generate`](https://github.com/spxis/rest-in-pieces/blob/main/docs/schema-generation.md): types, `enum`, `const`, `required`, `properties`, `items`, bounds, `format`, `allOf`, `oneOf`, `anyOf`, `nullable`, `readOnly`, `x-generator` and the rest of its supported keywords, with a property named `email` or `avatar` getting an email or an avatar. A response with no body (`204`) has none.
- **The same request, the same body, on every machine.** The body is seeded from the seed (`?seed=`, default 1), the method, the path with its parameter values, and the declared query parameters that are not a count. `/pets/1` and `/pets/2` differ, and `/pets/1` is `/pets/1` tomorrow. Dates are measured from the start of today (UTC), as in `/generate`.
- **A list as long as you ask.** A response that is an array, or an object with one array property (`data`, `items`, `results`, `content`, `records`, `rows` or `list` when there are several), is as long as the `limit`, `pageSize`, `page_size`, `per_page`, `perPage`, `size`, `count`, `take`, `maxResults` or `max_results` query parameter the operation declares says: its `default` when the request gives none, otherwise ten, and never more than 100. The first three items of a list of three are the first three of a list of eight.
- **The fields you send, and the id you ask for.** A `POST`, `PUT` or `PATCH` is answered but not kept (there is no store, and nothing to reset), and the fields it sent are put into the answer where the response schema has them: send `{"name":"Rex"}`, get a pet named Rex. A path parameter lands in the matching property: `/pets/42` for `/pets/{petId}` answers with `petId` (or, failing that, `id`) as 42.
- **The headers the document lists** for the response (`X-Total-Count`, `Location`, …) are made from their schemas. `X-Mock-Operation` names the operation that answered, which helps when two paths look alike. `HEAD` answers like `GET` without a body, and a preflight is answered for any origin.
- **The most specific path wins.** `/pets/mine` before `/pets/{petId}`. A server URL in the document (`https://api.example.com/v1`, or Swagger's `basePath`) is served as a prefix as well as at the root: `/v1/pets` and `/pets` both answer.
- **Not found and not allowed.** An address the document does not have is `404` with a hint to `GET /__mock`; one it has under other methods is `405` with `Allow`.

## Checks on the request

A request that does not fit the document is answered `400`, or `422` when the operation lists `422` and not `400`, with every fault named (up to 20 from the body; the rest are counted):

```json
{
  "error": "The request does not match the OpenAPI document.",
  "status": 422,
  "errors": [{ "in": "body", "path": "/name", "message": "must be at least 2 characters" }]
}
```

- **Path, query and header parameters:** required ones, and each value against its schema (types, `enum`, bounds, `format`, a list as repeated names or a comma-separated value). Names the document does not declare are ignored.
- **A JSON body:** required when the document says so, checked against its schema (`required`, `properties`, `additionalProperties`, types, bounds, lengths, `enum`, `const`, `format`, `items`, `uniqueItems`, `allOf`, `anyOf`, `oneOf`). A `readOnly` property is not demanded of a request. A body that is not JSON is `400`, a body sent as another content type is `415`, and one over 64 KB is `413`.
- **Formats checked:** `date`, `date-time`, `email`, `uuid`, `ipv4` and `uri`. Other formats are not checked.
- **Not checked:** `pattern` (a pattern from a document is never run as a regular expression, here or in the generator, so none can hang the server), security schemes (no token is asked for; use [`?auth=` and the sign-in routes](https://github.com/spxis/rest-in-pieces/blob/main/docs/writes-sessions-auth.md) on the built-in datasets for that), cookies, a `multipart` or form body, and the keywords the generator refuses. `oneOf` passes when at least one alternative does.
- **Filters and sorts are checked, not applied.** `?status=sold` must be one of the document's values, and the list that comes back is not narrowed to it, since there is no store.

The error body is REST in Pieces' own shape, not the one your document gives `400`. To see the document's error responses, ask for them: `?status=404`.

## The controls

On any route, in the query string, as on the built-in datasets:

| Control | Does |
| ------- | ---- |
| `?delay=1500`, `?delay=200-800` | Wait that many milliseconds (up to 10,000); a range picks the same wait for the same request |
| `?status=404` | Answer that status. If the document lists the status (or its `4XX` range, or `default`) with a schema, the body is made from it; otherwise `{ "error", "status", "simulated": true }`. `X-Simulated: true` marks it, and `429` and `503` carry `Retry-After`. A `2xx` the operation lists is answered with the body listed for it |
| `?fail=0.3` | Fail 30% of requests with a `500`, as above; `?fail=true` fails every one |
| `?trickle=200` | Send the body in pieces 200 ms apart |
| `?seed=7`, `?locale=ja`, `?safe=true` | Another seed, another [data locale](https://github.com/spxis/rest-in-pieces#data-locales), [safe values](https://github.com/spxis/rest-in-pieces#safe-values) (`--safe` makes that the default) |

A failure is answered before the request is checked, so a `?status=503` rehearses a failing backend whatever the request says.

**When your API uses one of those names itself,** your parameter keeps it. If an operation declares a `status` query parameter (`/pets?status=available`), `?status=` is that filter, and the control is `?_status=503` on that operation. `?_delay`, `?_status`, `?_fail`, `?_trickle`, `?_seed`, `?_locale` and `?_safe` work on every operation.

## See what is mocked

`GET /__mock` lists every operation with its status, its parameters and whether it takes a body; `GET /__mock/openapi.json` is your document as read; `GET /__mock/docs` shows it in the interactive reference. (These addresses are reserved: a document that uses them is shadowed on them.)

## In a test, a worker or a browser

`createMockApp(document)` is the same mock without a server, from `@johnmorrisdotca/rest-in-pieces/mock`. It uses no Node modules, so it runs in Vitest, Jest, Playwright, a worker or a page:

```ts
import { parse } from 'yaml';
import { createMockApp } from '@johnmorrisdotca/rest-in-pieces/mock';

const mock = createMockApp(parse(await readFile('openapi.yaml', 'utf8')), { seed: 7 });
const res = await mock.request('/pets/3');           // answered in process
expect(await res.json()).toMatchObject({ id: 3 });
```

Answer a Mock Service Worker request with it: `http.all('https://api.example.com/*', ({ request }) => mock.fetch(request))`. It throws `OpenApiError`, whose message names every fault, for a document it cannot mock. `createMock(document)` also returns the list of operations. It takes `{ seed, safe, log, specUrl }`.

## Limits, and what it refuses

It reads your document as untrusted input and refuses, with a message that names where, rather than ignoring:

- **A `$ref` must point inside the document** (`#/components/schemas/Pet`). A URL, a file or a relative path is refused at start-up, anywhere in the document, and nothing is fetched.
- **A keyword it cannot honour** in a response schema (`not`, `if`/`then`/`else`, `patternProperties`, `propertyNames`, `contains`, `dependent*`, `unevaluated*`, `$dynamicRef`), a pattern its parser does not read (lookahead, backreferences), and a schema that can never be made (a loop through required properties) stop start-up and are listed together, up to ten: a body that breaks the schema would be wrong data.
- **Bounded, like the generator:** 1,000 operations, 500,000 values and 5 MB in a document; the [schema limits](https://github.com/spxis/rest-in-pieces/blob/main/docs/schema-generation.md) (2,000 parts, 8 levels of nesting, 100 properties an object, 256 characters a string) on each response schema; a response of at most 5,000 values, 1,000,000 characters and 100 list items (a larger request answers `500` naming the limit); a request body of 64 KB; paths of 500 characters. A path becomes a pattern built from escaped text and `[^/]+`, so no path can make a match run away.
- **JSON bodies only.** A response whose document lists only `text/csv`, `application/xml` or a file answers `501` saying so. A response that lists JSON with no schema answers `{}`.
- **No `example` values.** The data is made from the schema; the `example` and `examples` in a document are not used.
- **No state.** Writes are answered, not kept; `--session` is for the built-in datasets and is refused with `--openapi`.
- **No GraphQL, WebSocket or callbacks** (a document's `webhooks` and `callbacks` are ignored).

The built-in datasets are not served in this mode: the mock answers your document and nothing else. To have both, run two servers on two ports.

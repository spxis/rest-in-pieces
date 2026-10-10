# Records from a JSON Schema or an OpenAPI schema

`POST /generate` makes seeded records that match a schema you send. Send `schema` (a JSON Schema) or `openapi` (an OpenAPI 3.x or Swagger 2 document) with `component` naming the schema in it, instead of a `fields` list. Paging, sorting, filters, search, every format (JSON, CSV, YAML, XML, NDJSON, SQL), `locale`, `safe`, `messy` and the latency and error simulation work as they do everywhere else. [Back to the README](https://github.com/spxis/rest-in-pieces#custom-fields-arguments-choices-and-blanks).

```sh
curl -X POST 'http://localhost:6800/generate?limit=3' \
  -H 'Content-Type: application/json' \
  -d '{
    "count": 100, "seed": 42,
    "schema": {
      "type": "object",
      "required": ["id", "email", "plan"],
      "properties": {
        "id": { "type": "integer", "minimum": 1, "maximum": 9999 },
        "email": { "type": "string", "format": "email" },
        "name": { "type": "string" },
        "plan": { "enum": ["free", "team", "enterprise"] },
        "sku": { "type": "string", "pattern": "^[A-Z]{3}-\\d{4}$" },
        "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 3 }
      }
    }
  }'
```

```sh
# From an OpenAPI document: name the schema in components.schemas (optional when there is one)
curl -X POST 'http://localhost:6800/generate?limit=3' -H 'Content-Type: application/json' \
  -d '{ "openapi": { "openapi": "3.0.3", "components": { "schemas": { "Pet": { "type": "object", "required": ["id", "name"], "properties": { "id": { "type": "integer" }, "name": { "type": "string" } } } } } }, "component": "Pet", "count": 20 }'
```

The same `seed`, `locale` and schema give the same records, and a different seed gives different ones. An object schema's properties become the record's fields after `index`; any other schema (an integer, an array) is the record's `value`. A property called `index` is refused, because every record already has one. Dates (`format: date-time`, `date`) are measured from the start of today, UTC.

This is a rule-based generator for a practical subset of JSON Schema. It is not a validator, and nothing about it is machine learning: it makes values that satisfy the keywords below, by drawing from the seed.

## What it understands

| Kind | Keywords |
| ---- | -------- |
| Types | `string`, `number`, `integer`, `boolean`, `null`, `object`, `array`; `type` may be a list (`["string", "null"]`); a schema with `properties` is an object, with `items` an array |
| Values | `enum`, `const`, `nullable` (OpenAPI 3.0), `x-generator` |
| Objects | `properties`, `required`; `readOnly` properties are kept, `writeOnly` ones are left out. Optional properties are present in about four records in five |
| Arrays | `items`, `prefixItems` (and the old tuple form of `items`), `minItems`, `maxItems`, `uniqueItems` (best effort: a repeat is drawn again up to ten times) |
| Strings | `minLength`, `maxLength`, `pattern` (a subset: below), `format` |
| Numbers | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` (as a number, or the `true` of Draft 4 and OpenAPI 3.0), `multipleOf` |
| Combining | `allOf` (merged), `oneOf` and `anyOf` (one branch, chosen by the seed) |
| References | `$ref` to a local JSON pointer: `#`, `#/$defs/Name`, `#/definitions/Name`, `#/components/schemas/Name` |

`format` values: `date-time`, `date`, `time`, `email`, `uri` (and `url`), `hostname`, `ipv4`, `ipv6`, `uuid`, `byte`, `password`. Emails, URLs, hostnames and IP addresses honour `safe=true` (example domains and documentation ranges). Other formats are ignored.

**Names help.** A plain string property gets a matching value by what it is called: `email`, `firstName`, `lastName`, `name`, `username`, `phone`, `city`, `country`, `state`, `zip`, `address`, `url`, `avatar`, `company`, `jobTitle`, `description` and a few more. **`x-generator`** names any generator type from `GET /generators`, with its arguments: `{ "type": "string", "x-generator": "person.fullName" }` or `"commerce.price(5,500,2)"`. Both respect `locale` and `safe`. A string is cut to `maxLength` and padded to `minLength`.

### `pattern`

A pattern is read by a hand-written parser and a string is *made* to match it; no regular expression is ever run, so no pattern can hang the server. Supported: literals and escapes, `.`, `\d`, `\w`, `\s`, classes (`[A-Z0-9_-]`, `[^…]`), groups `(…)` and `(?:…)`, alternation `|`, the quantifiers `?`, `*`, `+`, `{n}`, `{n,}` and `{n,m}`, and `^` and `$` at the two ends. Anything else (lookahead, backreferences, `\b`, named groups, `\p{…}`) answers `400` naming the pattern. A pattern may be 200 characters, have 200 parts, nest groups 8 deep, repeat at most 64 times and produce at most 256 characters.

## What it refuses

A schema it cannot honour is a `400` that names the keyword and where it is, never an ignored keyword: a record that broke the schema would be wrong data.

- **Unsupported keywords:** `not`, `if`, `then`, `else`, `patternProperties`, `propertyNames`, `contains`, `dependentSchemas`, `dependentRequired`, `dependencies`, `unevaluatedProperties`, `unevaluatedItems`, `$dynamicRef`, `$recursiveRef`. Keywords that do not change a value (`title`, `description`, `example`, `default`, `deprecated`, `additionalProperties`, `$schema`, `$id`, `discriminator`, `xml` and the like) are ignored.
- **Remote or odd references.** A `$ref` must point inside the same document. A URL, a file, a relative path (`./other.json`) or an anchor (`#foo`) is a `400`, and nothing is fetched: this module makes no network or file access.
- **Contradictions:** `minimum` above `maximum`, `minLength` above `maxLength`, `minItems` above `maxItems`, a `multipleOf` with no multiple in range, an empty `enum`, a `false` schema, an unknown `type`.

## Loops

A schema may refer to itself. Each record is cut where it can end: an optional property or a list that would go deeper than 8 levels is left out, and lists get shorter the deeper they are (3, then 2, then 1 item when `maxItems` says nothing). A loop that cannot end, because the property that closes it is `required` (or the list has `minItems`), is a `400` naming the path: make the property optional.

## Limits

Every request is bounded in work and in output, because the hosted API runs on a free serverless plan.

| Limit | Value |
| ----- | ----- |
| Records | 1,000 (`count`) |
| Schema size | 2,000 parts reachable from the root, each counted once; 100 properties per object; 500 `enum` values; 32 `$ref` hops |
| Nesting of objects and arrays | 8 |
| Items per array | 20 (`minItems` above that is a `400`; `maxItems` above that is made at 20) |
| String length | 256 (`minLength` above that is a `400`) |
| Values in one record | 500, counting a generator type as 5 and a pattern by its steps. Near the limit a record leaves out optional properties and shortens lists rather than failing |
| Values in one request | 200,000 |
| Characters in one request | 4,000,000 as JSON, under the 4.5 MB a serverless function may send |
| Request body | 64 KB |

Going past a request limit is a `400` that says to ask for fewer records or use a smaller schema.

## Errors

| Status | When | Example |
| ------ | ---- | ------- |
| `400` | Not exactly one of `fields`, `schema` and `openapi`; an unsupported keyword, remote reference, loop or limit | `"/a": the keyword "not" is not supported.` |
| `400` | `openapi` without a `component` when the document has several | `name the schema to generate with "component": one of Pet, Owner.` |
| `400` | `constraints` with a schema | `constraints work on a field list; a schema states its own rules.` |

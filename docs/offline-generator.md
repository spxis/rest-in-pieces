# Offline generator: `rest-in-pieces generate`

Seeded records written to a file or a pipe on your own machine, in any number, with no server to run, host or pay for. It is the same generator as `POST /generate`, so a schema that works against the API works here, and the first N records of a large run are exactly the N a small one makes. [Back to the README](https://github.com/spxis/rest-in-pieces#run-it).

```sh
# A hundred thousand rows for a database, from a JSON Schema
npx @johnmorrisdotca/rest-in-pieces generate --schema people.json --count 100000 --format sql --table people > people.sql

# A CSV for a spreadsheet, straight to a file
npx @johnmorrisdotca/rest-in-pieces generate --schema people.json --count 5000 --format csv --bom --output people.csv

# From a field list instead of a schema
npx @johnmorrisdotca/rest-in-pieces generate --fields 'name:person.fullName,born:date.birthdate(18,65),age:=age(born)' --count 20

# From an OpenAPI document (JSON or YAML), naming the schema in it
npx @johnmorrisdotca/rest-in-pieces generate --schema openapi.yaml --component Pet --count 1000 --format ndjson
```

A hundred thousand small records take about a second and a half and about 19 MB as SQL on a laptop. Records are made one at a time and written in 64 KB pieces, waiting when a pipe or a disk is slow, so a million records need no more memory than ten. After a run to `--output`, a summary goes to standard error: `Wrote 100,000 records (19.2 MB) to people.sql in 1.4 s.`

## Options

| Option | Meaning |
| ------ | ------- |
| `--schema <file>` | A JSON Schema, or an OpenAPI 3.x / Swagger 2 document, as JSON or YAML (`.yaml`, `.yml`). The file says which; `--openapi` is another name for the same option. See [schema-generation.md](https://github.com/spxis/rest-in-pieces/blob/main/docs/schema-generation.md) for what a schema may use |
| `--fields <list>` | A field list, as for `GET /generate`: `name:person.fullName,age:number.int(18,65)`, with [derived fields and distributions](https://github.com/spxis/rest-in-pieces/blob/main/docs/coherent-records.md). Give exactly one of `--schema` and `--fields` |
| `--component <name>` | The schema to use in an OpenAPI document's `components.schemas`. Optional when there is one |
| `--constraints <list>` | With `--fields`: `end>start,total>=subtotal` |
| `--count <n>` | Records to write, 1 to 10,000,000 (default 1,000) |
| `--seed <n>` | 0 to 4,294,967,295 (default 1) |
| `--format <name>` | `ndjson` (default), `json`, `csv` or `sql` |
| `--table <name>` | SQL: the table to insert into (default `records`) |
| `--batch <n>` | SQL: records per `INSERT`, 1 to 1,000 (default 1, one `INSERT` per record) |
| `--transaction` | SQL: wrap the statements in `BEGIN;` and `COMMIT;`, which makes a load into SQLite far faster |
| `--bom` | CSV: start with a UTF-8 byte-order mark, which Excel needs to read non-ASCII text. The API's CSV carries one |
| `--locale <code>` | A data locale from `GET /locales` (default `en-CA`; `global` mixes them) |
| `--safe` | [Safe values](https://github.com/spxis/rest-in-pieces#safe-values): example-domain emails, fiction-range phone numbers, test card numbers |
| `--base-url <url>` | With `--safe`: where avatar and image links point (default `http://localhost:6800`) |
| `--output <file>` | Write here instead of standard output. A file that fails half way is removed |

## Formats

The records are the API's, written the API's way:

- **`ndjson`** one JSON object per line, as `format=ndjson`.
- **`json`** a JSON array with one record per line.
- **`csv`** RFC 4180 with CRLF line endings, a header row, and nested values as JSON, as `format=csv`. The columns are fixed before the first row: `index`, then every property the schema may make (so an optional property that never appears in the first thousand rows still has its column) or every field of a field list.
- **`sql`** one `INSERT INTO "table" ("col", …) VALUES (…);` per record, with the API's quoting: standard double-quoted identifiers, `''` escapes, `TRUE`/`FALSE`, `NULL` for a missing value, and an object or array as its JSON in quotes. Dialect-neutral: PostgreSQL, SQLite, DuckDB and MySQL with `ANSI_QUOTES` read it. It writes no `CREATE TABLE`; make the table first.

## Same records as the API

For the same schema or field list, `--seed`, `--locale` and `--safe`, the output equals the API's records, so `--count 30` matches `POST /generate` with `"count": 30`, and `--count 1000000` begins with the same 30. Dates (`date.past`, `format: date-time`) are measured from the start of today, UTC, as in the API.

## Limits

An offline run is not held to the hosted API's limits on a whole request (200,000 values, 4 MB), but one record still is: a schema that needs more than 500 values in one record, nests deeper than 8, or asks for a reference outside the file is refused, so a runaway schema stops instead of filling a disk. A schema file may be up to 5 MB. Nothing is fetched and nothing is run on a timer.

## Errors

A schema, field list, locale or file the command cannot use prints `error: …` on standard error and exits with 1; a mistake in the options prints the usage and exits with 2. Whatever the API would answer `400`, the command prints the same sentence.

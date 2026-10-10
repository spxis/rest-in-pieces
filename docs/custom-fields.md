# Custom fields: arguments, choices and blanks

[Back to the README.](https://github.com/spxis/rest-in-pieces#readme)

`/generate` takes a type for each field, and a type may take arguments, a list of choices and a blank rate:

```sh
curl 'http://localhost:6800/generate?fields=age:number.int(18,65),price:commerce.price(5,500,2),status:pick(active,paused,closed|70,20,10),nickname:person.firstName?blank=15'
```

| Write | Means |
| ----- | ----- |
| `age:number.int(18,65)` | Arguments in parentheses, in the order `GET /generators` lists them under `parameters` (`number.int: "min, max"`). |
| `joined:date.between(2020-01-01,2025-12-31)` | Dates as `YYYY-MM-DD`. `date.between` is known only with its arguments. |
| `status:pick(active,paused,closed)` | One of the choices, evenly. Choices are text: at most 50, each up to 64 characters, with no `,`, `(`, `)` or `\|` inside. |
| `status:pick(active,paused,closed\|70,20,10)` | Weighted: one weight per choice after a `\|`, any numbers of 0 or more, not all 0. |
| `nickname:person.firstName?blank=15` | `null` in about 15% of records. `15%` works too (write it `15%25` in a URL, though a bare `%` is accepted). Goes after the arguments: `number.int(1,9)?blank=50`. |

- **Types that take arguments**: `number.int`, `number.float`, `commerce.price`, `finance.amount`, `date.past`, `date.future`, `date.recent`, `date.soon`, `date.between`, `date.birthdate`, `string.alpha`, `string.alphanumeric`, `string.numeric`, `string.hexadecimal`, `string.sample`, `lorem.words`, `lorem.sentence`, `lorem.sentences`, `lorem.paragraph`, `lorem.paragraphs`, `lorem.lines`, `word.words`, `internet.password`, `person.firstName`, `person.lastName`, `person.fullName` (`male` or `female`), `location.latitude`, `location.longitude`, `finance.creditCardNumber` (a network), `image.url` (width and height), and the distributions `number.normal`, `number.lognormal`, `number.exponential` and `number.zipf`.
- **Coherent records.** `age:=age(born)` is a derived field worked out from the others by a small, safe expression language (no `eval`), `constraints=end>start` puts two fields in order, and `number.normal`, `number.lognormal`, `number.exponential` and `number.zipf` draw values that bunch like real ones. Every expression is capped at 400 characters, 150 tokens, 12 deep and 100 parts, and a schema at 10 derived fields. See [docs/coherent-records.md](https://github.com/spxis/rest-in-pieces/blob/main/docs/coherent-records.md).
- **From a schema.** `POST /generate` with `{ "schema": { … } }` (a JSON Schema) or `{ "openapi": { … }, "component": "Pet" }` makes seeded records that match it: types, `enum`, `const`, `required`, string lengths, `pattern` (a subset, made by a parser rather than run), `format`, number bounds, arrays, `allOf`, `oneOf`, `anyOf` and local `$ref`s, including ones that loop. A keyword it cannot honour is a `400` that names it, a `$ref` outside the document is refused and nothing is fetched, and depth, array length, string length and values per request are capped. See [docs/schema-generation.md](https://github.com/spxis/rest-in-pieces/blob/main/docs/schema-generation.md).
- **Bounded.** Every argument has a range (lengths up to 256 characters, at most 50 words, 20 sentences or 10 paragraphs, sides up to 4,000), on top of the existing caps of 50 fields and 1,000 records; nothing is evaluated as code.
- **Clear errors.** A type that takes no arguments, a wrong count, a value that is not a number or a date, one out of range, a `min` above its `max`, a bad choice or weight, or a blank rate outside 0–100 answers `422` with `{ "error": "Field \"age\": …", "field": "age" }`. An unknown type is still a `400`, as before. The same syntax works in a `POST /generate` body: `{ "fields": { "age": "number.int(18,65)" } }`.

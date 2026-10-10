# Coherent records: derived fields, constraints and distributions

`/generate` builds records from a field list. Three things make those records hang together instead of being independent random values: **derived fields** (an age worked out from a birth date), **constraints** (an end after its start) and **distributions** (values that bunch the way real ones do). [Back to the README](https://github.com/spxis/rest-in-pieces#custom-fields-arguments-choices-and-blanks).

All of it is rule-based and seeded: the same seed gives the same records, and none of it is machine learning or a claim about how closely the data matches any real population.

## Derived fields

A derived field is written `=` followed by an expression over the record's other fields (and `index`). It is worked out after the other fields are made, from the values they ended with.

```sh
curl 'http://localhost:6800/generate?seed=7&limit=3&fields=born:date.birthdate(18,65),age:=age(born),first:person.firstName,last:person.lastName,email:=concat(lower(first),%27.%27,lower(last),%27@example.com%27)'
```

```json
{ "index": 0, "born": "1964-06-09T18:15:17.655Z", "age": 62, "first": "Nathanial", "last": "Kuvalis", "email": "nathanial.kuvalis@example.com" }
```

The same works in a `POST /generate` body: `{ "fields": { "born": "date.birthdate(18,65)", "age": "=age(born)" } }`.

- **Order.** A derived field may read other derived fields, in any order; the API sorts them out. Two that read each other, or one that reads itself, answer `400`.
- **Nothing else changes.** Derived fields draw nothing from the seed, so adding one leaves every other field's values exactly as they were.
- **In a URL**, write `+` as `%2B` (a bare `+` is a space in a query string). A POST body has no such problem. Text in an expression uses `'single'` or `"double"` quotes and may hold commas, brackets and colons.

### The language

| Kind | What it has |
| ---- | ----------- |
| Values | numbers (`1`, `2.5`), text (`'a'`, `"b"`), `true`, `false`, `null`, dates, and the names of other fields (letters, digits and `_`; a field named with a `-` cannot be read) |
| Arithmetic | `+ - * / %`, unary `-`; `+` joins text |
| Comparison and logic | `< <= > >= == !=`, `&& \|\| !` (a number other than 0, any non-empty text and `true` are true; `null`, `0`, `''` and `false` are false) |
| Choice | `condition ? a : b`, which nests |
| Numbers | `abs(x)`, `round(x, places?)`, `floor(x)`, `ceil(x)`, `sqrt(x)`, `pow(base, exponent)`, `min(a, b, …)`, `max(a, b, …)`, `clamp(x, low, high)` |
| Text | `concat(a, b, …)`, `lower(text)`, `upper(text)`, `trim(text)`, `len(text)`, `substr(text, start, length?)`, `slug(text)`, `pad(number, width)` |
| Missing values | `coalesce(a, b, …)`, `isNull(x)` |
| Dates | `date('2026-01-31')`, `today()`, `year(d)`, `month(d)`, `day(d)`, `dateOnly(d)`, `age(birthDate, asOf?)`, `years(from, to)`, `months(from, to)`, `days(from, to)`, `hours(from, to)`, `addDays(d, n)`, `addHours(d, n)`, `addMinutes(d, n)`, `addMonths(d, n)`, `addYears(d, n)` |

`GET /generators` lists every function under `functions`, and the limits under `limits`.

A step that cannot be worked out gives `null` instead of failing the request: a division by zero, a square root of a negative number, text subtracted from a number, a date that cannot be read, a missing source value. Comparing a number with text is `null`, not `false`.

Dates are UTC. `age` counts whole calendar years, as a birthday does; `years`, `months` and `days` count from the first date to the second. `addMonths` and `addYears` land on the last day of a shorter month (`2026-01-31` plus one month is `2026-02-28`).

### What an expression cannot do

It is hand-written code, not `eval`: no `Function`, no `vm`, no property access (`a.b`, `a[0]`), no assignment, no loops, no user-defined functions, no way to reach anything but the record's own values. Only the functions above exist; any other name is a `400`. Each expression is read into a tree once, checked, and walked once per record, so the work of a request is fixed before it runs.

| Limit | Value |
| ----- | ----- |
| Characters in one expression | 400 |
| Tokens | 150 |
| Nesting (brackets, calls, conditions) | 12 |
| Parts in one expression (so also the steps it takes per record) | 100 |
| Characters in text an expression builds | 1,000 (longer gives `null`) |
| Derived fields in one schema | 10 |

An expression that cannot be read, goes past a limit, calls a function that does not exist with the wrong number of arguments or names a field the schema does not have answers `400` with a message that names the field and what is wrong: `Field "age": "born" is not a field of this schema. Fields an expression can read: …`.

### `today()` and the dates generators measure from

Faker's `date.past`, `date.future`, `date.recent`, `date.soon` and `date.birthdate` measure from "now". In `/generate` they measure from the start of today, UTC, instead of the current millisecond, so the same seed gives the same dates all day, and `today()` is that same moment, so `age(born)` fits a `date.birthdate(18,65)` beside it. Tomorrow the dates move a day. For output that never moves, give explicit dates: `date.between(2020-01-01,2025-12-31)` and `age(born, '2026-01-01')`.

## Constraints

`constraints` puts pairs of generated fields in order.

```sh
curl 'http://localhost:6800/generate?fields=start:date.between(2026-01-01,2026-12-31),end:date.between(2026-01-01,2026-12-31)&constraints=end>start'
```

```json
{ "constraints": ["end > start"], "fields": { "start": "date.between(2026-01-01,2026-12-31)", "end": "date.between(2026-01-01,2026-12-31)" } }
```

| Write | Means |
| ----- | ----- |
| `end>start` or `end after start` | `end` is later than `start` |
| `end>=start` | `end` is the same or later |
| `start<end` or `start before end` | the same as `end>start` |
| `total>=subtotal`, `a<=b` | the same or later, either way round |

- **How it is kept.** The two values are put in order by swapping them, so each field keeps values from the same distribution and nothing is drawn again. When a strict constraint finds them equal, the later one moves on: a day for a date, one for a whole number, a hundredth for any other number. Text compares in alphabetical order. A blank, or two values of different kinds, is left alone.
- **Chains** (`a<b,b<c,c<d`) settle in a few passes. At most 10 constraints.
- **Refused** with `400`: a field the schema does not have, a field compared with itself, a derived field (constrain the fields it is worked out from), and constraints that contradict each other (`a>b,b>a`).
- Constraints are applied before derived fields, so a derived field sees the values after they were put in order.

## Distributions

| Type | Arguments | Draws |
| ---- | --------- | ----- |
| `number.normal` | `mean, sd, min?, max?, dec?` | A bell curve. A value outside `min`/`max` is drawn again, up to 20 times, then clamped. `dec` (default 2) is the decimal places. |
| `number.lognormal` | `median, sigma, min?, max?, dec?` | Always positive and skewed to the right, like prices and incomes: `median × e^(sigma × z)`. |
| `number.exponential` | `mean, max?, dec?` | Mostly small values with a long tail, like waiting times. |
| `number.zipf` | `n, s?` | A whole number from 1 to `n` (at most 10,000), where rank `k` is `1/k^s` as likely as rank 1 (`s` defaults to 1, 0 to 5). A few popular values and a long tail, like word and page popularity. |
| `pick(a,b,c\|70,20,10)` | choices, weights | A weighted choice (already available). |

```sh
curl 'http://localhost:6800/generate?fields=score:number.normal(70,10,0,100,0),income:number.lognormal(52000,0.5,10000,500000,0),page:number.zipf(1000,1.1)'
```

These are textbook distributions drawn from the seed. They do not model any real population, and the shapes are not a statement about fidelity to real data.

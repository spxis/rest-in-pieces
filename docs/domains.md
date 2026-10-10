# More domains: invoices, transactions, events, messages, notifications, jobs, places, metrics and logs

Nine read-only datasets for the screens that need more than users and products. Each is seeded like `/companies`: the same `seed` and `locale` give the same records, in the locale's currency and country, with paging, sorting, filters, search, every format (JSON, CSV, YAML, XML, NDJSON, SQL), `messy`, `safe`, `expand`-free item routes (`/invoices/{id}`) and the latency and error simulation. They take no writes. [Back to the README](https://github.com/spxis/rest-in-pieces#endpoints).

What makes them useful for testing is that each record agrees with itself, so a UI that depends on a rule has data that follows it. Nothing here is a model of any real business, bank or population.

**A field named `status` cannot be filtered**, because `status` is the request parameter that simulates an HTTP error. These datasets follow `orderStatus`: the field is `invoiceStatus`, `transactionStatus`, `eventStatus` or `jobStatus`, so `/invoices?invoiceStatus=overdue` filters.

All dates fall around 2026-01-01, the fixed "now" every seeded dataset uses, so output never moves with the clock.

| Dataset | A record is | Rules every record keeps |
| ------- | ----------- | ------------------------ |
| `/invoices` | An invoice with `lines`, `subtotal`, `tax`, `total` and `amountDue`, in the locale's currency | `lineTotal = quantity × unitPrice`; `subtotal` adds the lines; `tax = subtotal × taxRate` and `total = subtotal + tax`, each exact to the currency's smallest unit; `dueAt = issuedAt + termsDays`; a `sent` invoice is not yet due, an `overdue` one is; only a `paid` invoice has a `paidAt`, between issue and ten days after the due date; a `draft` has no dates; `amountDue` is `total` while sent or overdue, else 0 |
| `/transactions` | A bank-style transaction: card, transfer, deposit, withdrawal, fee, refund, interest | `amount` is negative for money out (card, withdrawal, fee) and positive for money in (deposit, refund, interest); `postedAt` is after `occurredAt`, and null while `pending` or after a decline |
| `/events` | A calendar event with `startsAt`, `endsAt`, `timeZone`, `recurrence` (`FREQ=WEEKLY`) and `meetingUrl` | `endsAt` is after `startsAt`; all-day events run midnight to midnight; only meetings recur; `timeZone` is an IANA zone for the locale's country |
| `/messages` | An inbox message with `fromName`, `fromEmail`, `toName`, `toEmail`, `subject`, `body`, `labels` | Sent in id order; a reply (`inReplyTo`) answers a lower id, is sent after it and carries `Re:` and its chain's first subject; `readAt` is after `sentAt` |
| `/notifications` | An app notification to a user in `/users` by `userId`, with `type`, `channel`, `priority` and the `actionPath` it is about | `userId` is always 1 to 1,000; `readAt` is after `createdAt`; no unfilled placeholders |
| `/jobs` | A job posting with a yearly salary range, `skills`, `workplace` and `jobStatus` | `salaryMin` below `salaryMax`, and both higher for senior roles; `closesAt` after `postedAt`; a `closed` or `filled` job closed in the past, an `open` or `paused` one has not; `applicants` grow with the days open |
| `/places` | A point of interest with `latitude`, `longitude` and a GeoJSON `geometry` | Every place is within 15 km of its locale's best-known city centre (Toronto, New York, London, Berlin, Paris, Mumbai, Tokyo, Seoul, Shanghai, São Paulo, Mexico City, Moscow, Jakarta, Ho Chi Minh City); `distanceKm` says how far, so `sortBy=distanceKm:numeric` is nearest first; parks and libraries have `priceLevel` 1 |
| `/metrics` | A server metrics point every 5 minutes: `cpuPercent`, `memoryPercent`, `requestsPerSecond`, `latencyMs`, `errorRatePercent`, `incident` | A pure function of the `seed` and the position: see below |
| `/logs` | A log line about every 15 seconds: `level`, `service`, `message`, `traceId`, and for `api` lines a `statusCode` | A pure function of the `seed` and the position: see below |

```sh
curl 'http://localhost:6800/invoices?invoiceStatus=overdue&sortBy=total:numeric&sortDirection=desc&limit=5'
curl 'http://localhost:6800/places?locale=ja&sortBy=distanceKm:numeric&limit=5'      # nearest to the centre of Tokyo
curl 'http://localhost:6800/events?category=meeting&locale=de&limit=5'
curl 'http://localhost:6800/logs?level=error&service=api&limit=20&format=ndjson'
curl 'http://localhost:6800/metrics?seed=7&limit=1000&format=csv'                  # a chart's worth of points
curl 'http://localhost:6800/invoices?limit=100&format=sql&table=invoices'          # seed a database
```

## Time series: a pure function of the seed and the index

`/metrics` and `/logs` are not built by drawing numbers one after another. Record `i` is worked out from `(seed, i)` alone, with nothing carried from the record before and no clock read, so:

- the same seed gives the same series, today and next year, in every locale;
- any record can be computed without the others (`metricAt(seed, index)` and `logAt(seed, index)` in the source);
- time is the index: point `id` of `/metrics` is `id - 1` five-minute steps after a fixed start, and the series ends at 2026-01-01; `/logs` lines are `id - 1` steps of about fifteen seconds on, with under ten seconds of jitter, so `timestamp` always increases.

A metrics series has one `host`, a daily wave in traffic (high mid-afternoon, quiet at night), noise, memory that creeps up and resets, and in about two half-days in three one `incident`: six consecutive points where latency is about four times higher, errors about twelve times higher and CPU up. `incident` says which points they are, so a chart or alert has something to find. Logs are mostly `info` (about 60%) with `debug`, `warn`, `error` and a few `fatal`, from five services; `api` lines carry a status code (500s for errors).

Both are limited like every dataset: at most 1,000 records and every request bounded.

## Locales and text

Names, companies, cities, addresses and currency follow the `locale`. Free text (descriptions and message bodies) is Faker's lorem. Fixed vocabulary (statuses, categories, subjects, skills, log messages) is English in every locale: these datasets have no hand-written Japanese.

`safe=true` moves the emails in `/invoices`, `/messages` and `/events` to example domains. Meeting links are always on `meet.example.com`.

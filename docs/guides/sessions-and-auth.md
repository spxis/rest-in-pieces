---
title: Test writes, sessions and sign-in
section: how-to
order: 4
description: Choose stateless writes or an explicitly bounded in-memory store for each test.
---

## Choose whether writes persist

The default app validates and answers supported writes without retaining them. With `session: true` or a limits object, later reads in the same app see those changes until `POST /reset`. Each dataset is keyed by seed and locale. Another app instance has another store; the session writes no files.

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false, session: { records: 50, datasets: 2, bytes: 32768 } });
console.log((await api.request("/users?seed=7&limit=1")).status);
console.log((await api.request("/reset", { method: "POST" })).status);
```

## Bound the test store

[SessionLimits](api:SessionLimits) caps records, held datasets and JSON bytes. A full store returns the documented `507` rather than silently growing. [The write/session/auth guide](../writes-sessions-auth.md) keeps the native CRUD, cascade, sign-in, refresh and access-control recipes. These are test tokens and synthetic identities; keep their seed and state in the test setup.

## Reset deliberately

Reset before a test that assumes seeded defaults, or construct a fresh app. Keep one app for a test that intentionally follows a write with a read. [Querying related records](queries-and-relations.md) explains why a different seed or locale does not select the same overlay.

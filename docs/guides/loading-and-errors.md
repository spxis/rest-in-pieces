---
title: Exercise loading and error states
section: how-to
order: 3
description: Use native delay, failure, status and streaming controls without replacing your client.
---

## Start with an exact status

An explicit `status` makes an error screen repeatable. Read the actual status, body and headers; do not infer success from a JSON body alone.

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false });
const down = await api.request("/users?seed=7&status=503");
console.log(down.status, down.headers.get("retry-after"));
```

## Try a slow or partial response

Use `delay` for a slow response, `trickle` for a body arriving in pieces, or `fail` for a seeded failure-rate drill. The [HTTP guide](../api-guide.md) lists units, accepted bounds and controls. A loading state needs its own assertion; a retry needs to preserve the request's seed and filters.

```sh
curl 'http://localhost:6800/users?seed=7&limit=2&delay=1000'
```

## Events are a separate flow

`/streams` serves bounded Server-Sent Events, with reconnect and drop drills. The in-browser API answers fetch; a native `EventSource` needs the Node server. Keep the [streaming contract](../streams.md), especially the connection and event limits, when testing reconnection. [Troubleshooting](troubleshooting.md) distinguishes a refused request from a deliberately simulated one.

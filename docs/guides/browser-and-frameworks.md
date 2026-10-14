---
title: Connect browser fetch, MSW and Vite
section: how-to
order: 5
description: Keep the real request path while choosing an adapter for your development or test environment.
---

## A local fetch function

[inBrowserFetch](api:inBrowserFetch) routes only the configured origin and path prefix to a lazy app. Other requests go to the supplied original fetch. This absolute virtual URL works in Node as well as a browser and makes no network request for its matching API path.

```ts
import { inBrowserFetch } from "@johnmorrisdotca/rest-in-pieces/browser";
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const localFetch = inBrowserFetch("https://example.test/api", async () => createApp({ log: false }), fetch);
console.log((await localFetch("https://example.test/api/users?seed=7&limit=2")).status);
```

## Install and remove the global adapter

[installInBrowserApi](api:installInBrowserApi) returns a cleanup function. In a browser, a relative base resolves against the page; outside a browser use an absolute URL. Call cleanup when the test or page no longer needs the patch.

```ts no-run
import { installInBrowserApi } from "@johnmorrisdotca/rest-in-pieces/browser";

const restore = installInBrowserApi({ base: "/api", app: { log: false } });
try { console.log((await fetch("/api/users?seed=7&limit=2")).status); }
finally { restore(); }
```

## MSW and Vite

Pass MSW's own `http` namespace; `/msw` does not import MSW at runtime. MSW 3 supplies it from `msw/http`; MSW 2 supplies it from `msw`. Node handlers need an absolute base. Starting the worker or server is still the caller's job.

```ts
import { http } from "msw/http";
import { restInPiecesHandlers } from "@johnmorrisdotca/rest-in-pieces/msw";

const handlers = restInPiecesHandlers({ http, base: "https://example.test/api", app: { log: false } });
console.log(handlers.length);
```

```ts
import { restInPieces } from "@johnmorrisdotca/rest-in-pieces/vite";

console.log(restInPieces({ base: "/api", app: { log: false } }).name);
```

The Vite plugin applies to development serving, not a production backend. [The preserved integration recipes](../use-with.md) cover client/test setups and lifecycle cleanup. [Native embeds](native-embeds.md) need no fetch patch in the host page.

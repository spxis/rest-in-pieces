---
title: Query related, repeatable records
section: how-to
order: 2
description: Keep seed and locale stable while paging, sorting, searching and expanding relations.
---

## Keep the result set stable

Use the same dataset, seed and locale across requests. Pagination controls choose a slice; filters, search and sorting choose its result set. A cursor carries an offset and a fingerprint, so changing the result set while following it is refused. Do not treat a cursor as an authorization credential or decode it to invent a different page.

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";
import { queryFingerprint } from "@johnmorrisdotca/rest-in-pieces/cursor";

const api = createApp({ log: false });
console.log((await api.request("/users?seed=7&limit=2&offset=2&sortBy=name")).status);
console.log(queryFingerprint({ seed: "7", sortBy: "name", limit: "2" }) ===
  queryFingerprint({ seed: "7", sortBy: "name", limit: "10" }));
```

## Follow a relationship

Users, orders, products, posts, comments, todos and reviews share the documented identifiers. Request related records through the native relationship routes, or use `expand` on an operation that supports it. Read the [relationship catalogue](../relations.md) before assuming that two arbitrary fields form a join. A different seed or locale is another dataset.

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false });
console.log((await api.request("/users/1/orders?seed=7&limit=2")).status);
```

## Keep data locale separate from the interface

The playground's EN/JA choice changes labels. Its data locale changes generated names and addresses. [Data fixtures](../fixtures.md) and [coherent records](../coherent-records.md) explain how to keep related exports together. [Sessions](sessions-and-auth.md) add persistent writes to one API instance.

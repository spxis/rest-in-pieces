---
title: Use real places with invented records
section: how-to
order: 8
description: Keep reference countries and geographic data distinct from seeded people and addresses.
---

## Know which data is generated

People and test records are invented. Countries, subdivisions, groupings, withdrawn codes, flags and maps come from the documented family data sources. [The reference-data guide](../reference-data.md) preserves endpoint names, fields, English/Japanese labels and optional peer behavior.

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false });
console.log((await api.request("/countries?limit=2")).status);
console.log((await api.request("/addresses?country=CA&seed=7&limit=2")).status);
```

## Optional geographic artwork

Flag and map routes depend on their optional packages and supported country/drawing identifiers. Missing peers are reported rather than replaced with invented geometry. `/geo/features` uses Chizu's documented feature data. Read the native [reference guide](../reference-data.md) before assuming country, subdivision and feature codes are interchangeable.

## Safe generated values

[Safe values](../safe-values.md) describes example domains, reserved phone ranges, test card values and self-hosted pictures. The safe default arrived in 3.0. A per-request `safe=false` explicitly asks for the previous formatting. [Upgrading](upgrading.md) records that change and keeps the seven-country address formats visible.

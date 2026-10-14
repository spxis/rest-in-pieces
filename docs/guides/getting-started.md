---
title: Getting started
section: tutorial
order: 1
description: Run a local API or request seeded records directly from the SDK.
---

## Choose how it runs

The CLI runs a Node server and its playground. The core SDK answers `Request` objects in memory, with no port. The browser adapter, MSW handlers and Vite plugin use that same core. The public Pages playground runs the API inside the tab.

```sh
npx @johnmorrisdotca/rest-in-pieces --port 6800
```

Open `http://localhost:6800/`, or fetch `http://localhost:6800/users?seed=7&limit=2`. A repeated seed, locale and query reproduce the same records. Generated names are invented; reference countries and subdivisions are real.

## Use the core SDK

```sh
npm install @johnmorrisdotca/rest-in-pieces
```

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false, safe: true });
const response = await api.request("/users?seed=7&limit=2");
console.log(response.status);
```

`createApp` gives each caller an independent API. Keep one instance when a session should retain writes; create another when a test needs a clean store. The main import is the Node app, including its optional built playground; `/core` avoids Node static-file serving.

## Find the next recipe

[Query records](queries-and-relations.md), [try loading and errors](loading-and-errors.md), [connect a frontend](browser-and-frameworks.md), or [mock your own OpenAPI](openapi-mocks.md). The [HTTP API guide](../api-guide.md) keeps the full route and control reference. [Every SDK entry](entry:main) shows its checked imports and examples.

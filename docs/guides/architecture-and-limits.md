---
title: Architecture and limits
section: explanation
order: 10
description: Understand the shared core, package entries, bounded generators and measured size targets.
---

## One core, several adapters

`createApp` composes native resources, controls, schemas and request handlers. The Node app adds environment configuration and static playground serving. Browser fetch, MSW and Vite adapt the same core instead of implementing different datasets. Serializers and SVG image helpers are pure subentries; import those when that is all the client needs.

## What the size badge includes

The main size badge bundles the Node entry and its dependency/data graph, minifies for ES2020, and gzips at level 9. Its Node built-ins stay external. The Vite entry also uses a Node target; other runtime entries use the neutral target. Generated OpenAPI types have reference pages but no JavaScript size. This is a complete bundled-import measurement, not the installed tarball or the Pages download.

## Bounds and optional data

Sessions, OpenAPI documents, generated values, streams, image dimensions and embeds each retain their native bounds. The [SDK reference](entry:core), [mock caps](api:MOCK_LIMITS), [session limits](api:SessionLimits) and [original architecture/HTTP material](../api-guide.md) describe them. [Synthetic patients](../synthetic-patients.md), [schema generation](../schema-generation.md), [custom fields](../custom-fields.md) and [offline generation](../offline-generator.md) preserve the detailed features.

## Documentation ownership

Source comments supply SDK reference pages. The build script writes OpenAPI schemas and types; `scripts/docs-openapi.ts` supplies comments for all five public type exports. The docs reader uses a development-only JavaScript compiler API with TypeScript 7 projects, while the native TypeScript 7 CLI still builds the SDK and checks examples. Guides, changelog, README and workflows live at the repository root; the public SDK remains in `apps/api`.

## Native playground picture

[![The REST in Pieces playground](https://raw.githubusercontent.com/spxis/rest-in-pieces/main/docs/art/playground.png)](https://spxis.github.io/rest-in-pieces/)

[The original architecture diagram and complete explanation](../architecture.md).

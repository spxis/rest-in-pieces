---
title: Troubleshooting and FAQ
section: troubleshooting
order: 11
description: Identify malformed queries, missing optional data, empty outputs and cleanup mistakes.
---

## The response is not the one expected

Read the actual HTTP status and error body. Check whether `status`, `fail`, `delay`, `trickle`, auth or session state was deliberately configured. Keep seed, locale, dataset and filters the same; a cursor for a different result set is refused. The [HTTP guide](../api-guide.md) lists accepted controls and [loading/error recipes](loading-and-errors.md) make failures repeatable.

## Null, undefined and empty output

`MockOperationInfo.body` is null when an operation declares no body. Its `status` is undefined when no response can be produced. Image `hexColour` uses its fallback for undefined or invalid input. CSV writes null/undefined as blank cells; NDJSON writes null records as JSON null; SQL writes absent, null/undefined or non-finite values as NULL. Empty serializers return the documented empty string. Read the individual [mock](entry:mock), [image](entry:images) and [serializer](entry:serialize) contracts rather than interpreting these cases as missing network data.

## Setup and resource errors

Register the table before creating its tag, or use explicit [defineTable](api:defineTable). A browser-relative fetch base needs a page URL; Node needs an absolute one. Restore a global fetch adapter when its owner finishes. Vite serves the API only during development. Missing optional map/flag peers produce the native error; invalid SQL table names throw [SqlTableError](api:SqlTableError), and invalid/oversized OpenAPI input throws [OpenApiError](api:OpenApiError).

## The types or docs are stale

Run the repository build before docs checks. OpenAPI declarations are generated; edit their authoritative writer rather than a built `.d.ts`. For request shapes use [the generated type entry](entry:types); for a live route use the API's OpenAPI document. [Upgrading](upgrading.md) covers the 3.0 safe-value change.

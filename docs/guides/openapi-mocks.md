---
title: Mock your own OpenAPI document
section: how-to
order: 6
description: Prepare supported document operations and inspect the bounded mock before using it.
---

## Prepare a document in memory

[createMock](api:createMock) validates the document, prepares supported response schemas and returns an app with an operation catalogue. It reads an object; file loading and UI document selection are separate steps. This sample has one JSON array operation.

```ts
import { createMock } from "@johnmorrisdotca/rest-in-pieces/mock";

const specification = {
  openapi: "3.0.3", info: { title: "Widgets", version: "1.0.0" },
  paths: { "/widgets": { get: { responses: { "200": {
    description: "Widgets", content: { "application/json": { schema: {
      type: "array", items: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    } } },
  } } } } },
};
const mock = createMock(specification, { seed: 7, log: false });
console.log(mock.operations.length, (await mock.app.request("/widgets?limit=2")).status);
```

## Inspect support and limits

Read each [MockOperationInfo](api:MockOperationInfo). `body` is null when no request body is declared; `status` is undefined when an operation has no response the mock can produce. [SPEC_LIMITS](api:SPEC_LIMITS) caps the submitted document; [MOCK_LIMITS](api:MOCK_LIMITS) caps response values, list items and body size. Invalid or unsupported documents raise [OpenApiError](api:OpenApiError).

## Keep the native document contract

[Mock your OpenAPI](../mock-your-openapi.md) records supported schemas, operations, request-body behavior, UI controls and the CLI flow. Controls such as `delay` also accept their `_name` form when a document declares a field of that name. A mock is a test implementation, so use the operation catalogue and actual response instead of assuming full server-side behavior from the document alone.

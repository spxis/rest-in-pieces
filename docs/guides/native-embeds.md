---
title: Embed the native sample-data table
section: how-to
order: 9
description: Use the custom element or isolated frame with the existing native table contract.
---

## Choose element or frame

The custom element uses the native read-only sample table; `/element/define` registers it. [defineTable](api:defineTable) also supports explicit registration. The iframe keeps its API inside the frame and needs no fetch patch in its host page.

```ts no-run
import { RestTable, defineTable } from "@johnmorrisdotca/rest-in-pieces/element";

console.log(defineTable("rest-in-pieces-table"));
const table = new RestTable();
table.setAttribute("resource", "names");
table.setAttribute("rows", "5");
table.setAttribute("seed", "7");
document.body.append(table);
console.log(table.localName);
```

## Copy the supported recipe

[The complete embed contract](../embeds.md) preserves every setting, event, load message, accessibility detail and supported code format. The builder previews the actual component. Interface language and generated-data locale are separate settings. Frame events contain metadata, not record payloads.

## Keep the integration boundaries

Use the component's native attributes and [RestTableOptions](api:RestTableOptions), not a reconstructed HTML table or a replacement data generator. Framework examples and the frame URL in the preserved contract remain the source for lifecycle cleanup. [Browser adapters](browser-and-frameworks.md) are for a client's own requests, not required by this isolated embed.

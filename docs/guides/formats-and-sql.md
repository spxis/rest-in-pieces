---
title: Export CSV, NDJSON and SQL
section: how-to
order: 7
description: Use the same serializers as the API, playground downloads and static exports.
---

## Serialize the records, not the response envelope

[The serializer entry](entry:serialize) contains pure functions with no imports. CSV writes encountered keys as columns and nested values as JSON. NDJSON writes a JSON value per line. SQL writes one INSERT per record; absent columns, null and undefined become SQL NULL.

```ts
import { toCsv, toNdjson, toSql, SQL_TABLE } from "@johnmorrisdotca/rest-in-pieces/serialize";

const records = [{ id: 1, name: "Ada" }, { id: 2, name: null }];
console.log(toCsv(records).trim());
console.log(toNdjson(records).trim());
console.log(SQL_TABLE.test("people"));
console.log(toSql(records, "people").trim());
```

## Choose a valid table name

`toSql` accepts a letter or underscore followed by letters, digits or underscores, at most 63 characters. [SqlTableError](api:SqlTableError) refuses an invalid name. `sqlIdentifier` quotes an identifier but does not perform that table-name validation. [sqlValue](api:sqlValue) escapes literals and writes non-finite numbers as NULL.

## Keep the existing format details

[The HTTP guide](../api-guide.md), [static API](../static-api.md), and [fixtures](../fixtures.md) preserve download routes and metadata differences. Standard quoted identifiers need the documented SQL dialect setting where applicable. The serializer writes text; it does not connect to a database or execute SQL. Use [CSV_BOM](api:CSV_BOM) when a spreadsheet needs its encoding marker.

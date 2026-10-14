---
title: 自分のOpenAPIからモックを作る
section: how-to
order: 6
description: 対応する操作を読み込み、上限付きのモックを確認してから使います。
---

## メモリ内で準備する

[createMock](api:createMock)は、ドキュメントを検証して対応する応答スキーマを準備し、操作の一覧を持つAPIを返します。入力はオブジェクトです。ファイルの読み込みや画面での選択は別の手順です。この例には、JSON配列を返す操作が1つあります。

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

## 対応状況と上限を確認する

[MockOperationInfo](api:MockOperationInfo)を確認してください。リクエスト本文が定義されていない場合、`body`はnullです。生成できる応答がない場合、`status`はundefinedです。[SPEC_LIMITS](api:SPEC_LIMITS)は入力ドキュメントを、[MOCK_LIMITS](api:MOCK_LIMITS)は応答の値、配列の要素数、本文の大きさを制限します。不正または未対応のドキュメントでは[OpenApiError](api:OpenApiError)が発生します。

## 既存の仕様を確認する

[OpenAPIモックのガイド](../../mock-your-openapi.md)には、対応するスキーマと操作、リクエスト本文、画面の制御、CLIの使い方があります。ドキュメントに同じ名前の項目がある場合、`delay`などの制御は`_name`形式でも使えます。モックはテスト用の実装なので、実際の操作一覧と応答を確認してください。

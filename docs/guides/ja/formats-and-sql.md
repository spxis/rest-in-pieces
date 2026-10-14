---
title: CSV、NDJSON、SQLで保存する
section: how-to
order: 7
description: API、プレイグラウンド、静的エクスポートと同じ変換関数を使います。
---

## 応答全体ではなくレコードを変換する

[変換関数のエントリー](entry:serialize)には、インポートのない純粋な関数があります。CSVでは見つかったキーを列にし、入れ子の値をJSONにします。NDJSONでは1行に1つのJSON値を書きます。SQLではレコードごとにINSERTを書き、存在しない列、null、undefinedをSQLのNULLにします。

```ts
import { toCsv, toNdjson, toSql, SQL_TABLE } from "@johnmorrisdotca/rest-in-pieces/serialize";

const records = [{ id: 1, name: "Ada" }, { id: 2, name: null }];
console.log(toCsv(records).trim());
console.log(toNdjson(records).trim());
console.log(SQL_TABLE.test("people"));
console.log(toSql(records, "people").trim());
```

## 有効なテーブル名を選ぶ

`toSql`のテーブル名は、英字またはアンダースコアで始め、英字、数字、アンダースコアを続ける、最大63文字の名前です。不正な名前では[SqlTableError](api:SqlTableError)が発生します。`sqlIdentifier`は識別子を引用しますが、この名前の検証は行いません。[sqlValue](api:sqlValue)はリテラルをエスケープし、有限でない数値をNULLにします。

## 形式ごとの詳細

[HTTPガイド](../../api-guide.md)、[静的API](../../static-api.md)、[フィクスチャー](../../fixtures.md)には、ダウンロード経路とメタデータの違いがあります。必要な場合は、標準の引用符付き識別子に対応するSQL方言の設定を使ってください。変換関数はテキストを書き、データベースへの接続やSQLの実行は行いません。表計算ソフトで文字コードのマーカーが必要な場合は[CSV_BOM](api:CSV_BOM)を使います。

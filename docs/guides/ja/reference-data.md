---
title: 実在する場所と架空のレコードを使う
section: how-to
order: 8
description: 国や地理の参照データと、シード値から作る人名や住所を分けて扱います。
---

## 生成データと参照データを分ける

人名やテスト用レコードは架空のものです。国、行政区分、グループ、廃止されたコード、旗、地図には、定義されたファミリーのデータを使います。[参照データのガイド](../../reference-data.md)には、エンドポイント、項目、英語・日本語の名前、任意の依存パッケージの扱いがあります。

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false });
console.log((await api.request("/countries?limit=2")).status);
console.log((await api.request("/addresses?country=CA&seed=7&limit=2")).status);
```

## 任意の地理データ

旗や地図のルートには、対応する任意パッケージと国・描画の識別子が必要です。パッケージがない場合はエラーを返し、架空の形で置き換えません。`/geo/features`はChizuの定義された地物データを使います。国、行政区分、地物のコードを同じものとして扱う前に、[参照ガイド](../../reference-data.md)を確認してください。

## 安全な生成値

[安全な値](../../safe-values.md)では、例示用ドメイン、予約された電話番号の範囲、テスト用カード番号、自前の画像を説明しています。3.0から安全な値が初期設定です。`safe=false`を明示すると以前の形式を指定できます。[移行ガイド](upgrading.md)では、この変更と7か国の住所形式を確認できます。

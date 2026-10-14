---
title: サンプルデータの表を埋め込む
section: how-to
order: 9
description: 既存のテーブルの契約を保ち、カスタム要素または独立したフレームを使います。
---

## 要素かフレームを選ぶ

カスタム要素は、標準の読み取り専用サンプルテーブルを使います。`/element/define`で登録し、[defineTable](api:defineTable)で明示的に登録することもできます。iframeではフレーム内でAPIが動くため、ホストページのfetchを書き換える必要はありません。

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

## 対応するコードをコピーする

[埋め込みの契約](../../embeds.md)には、設定、イベント、読み込みメッセージ、アクセシビリティ、コード形式の詳細があります。ビルダーは実際のコンポーネントを表示します。操作の言語と生成データの言語・地域は別の設定です。フレームのイベントにはメタデータが入り、レコード本体は入りません。

## 境界を保つ

別のHTMLテーブルや生成器で置き換えず、標準の属性と[RestTableOptions](api:RestTableOptions)を使います。フレームURLやフレームワークでの解除手順は、既存の契約を参照してください。[ブラウザー用アダプター](browser-and-frameworks.md)はクライアント自身のリクエスト用で、この独立した埋め込みには不要です。

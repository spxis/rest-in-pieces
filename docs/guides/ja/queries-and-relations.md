---
title: 関連データを同じ条件で取得する
section: how-to
order: 2
description: シード値と言語・地域を固定し、ページ送り、並べ替え、検索、関連データの展開を行います。
---

## 検索条件を固定する

データセット、シード値、データの言語・地域を同じにします。ページ送りのパラメーターは取得する範囲を選び、フィルター、検索、並べ替えは対象のデータを決めます。カーソルはオフセットと条件の識別値を持つため、途中で検索条件を変えると拒否されます。認証情報として使ったり、別のページを作るために書き換えたりしないでください。

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";
import { queryFingerprint } from "@johnmorrisdotca/rest-in-pieces/cursor";

const api = createApp({ log: false });
console.log((await api.request("/users?seed=7&limit=2&offset=2&sortBy=name")).status);
console.log(queryFingerprint({ seed: "7", sortBy: "name", limit: "2" }) ===
  queryFingerprint({ seed: "7", sortBy: "name", limit: "10" }));
```

## 関連データを取得する

ユーザー、注文、商品、投稿、コメント、ToDo、レビューは、定義された識別子で関連しています。関連ルートを使うか、対応する操作で`expand`を指定します。任意の2つの項目を結び付ける前に、[関連の一覧](../../relations.md)を確認してください。シード値や言語・地域が変わると、別のデータセットになります。

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false });
console.log((await api.request("/users/1/orders?seed=7&limit=2")).status);
```

## データと操作の言語を分ける

プレイグラウンドのEN/JAはラベルの言語です。データの言語・地域は、生成する名前や住所を変えます。[フィクスチャー](../../fixtures.md)と[整合性のあるレコード](../../coherent-records.md)では、関連したエクスポートの扱いを説明しています。[セッション](sessions-and-auth.md)を使うと、同じAPIインスタンスで書き込みを保持できます。

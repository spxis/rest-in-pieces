---
title: 書き込み、セッション、サインインを試す
section: how-to
order: 4
description: テストごとに、状態を保持しない書き込みか、上限付きのメモリ内ストアを選びます。
---

## 書き込みを保持するか選ぶ

初期設定では、対応する書き込みを検証して応答しますが、変更は保持しません。`session: true`または上限のオブジェクトを指定すると、同じAPIへの読み込みで変更が見え、`POST /reset`まで残ります。データセットはシード値と言語・地域で区別します。別のAPIインスタンスは別のストアを持ち、ファイルには書き込みません。

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false, session: { records: 50, datasets: 2, bytes: 32768 } });
console.log((await api.request("/users?seed=7&limit=1")).status);
console.log((await api.request("/reset", { method: "POST" })).status);
```

## ストアに上限を設ける

[SessionLimits](api:SessionLimits)では、レコード数、保持するデータセット数、JSONのバイト数を制限します。上限に達すると、無制限に増やす代わりに定義された`507`を返します。[書き込み・セッション・認証のガイド](../../writes-sessions-auth.md)には、CRUD、関連レコードの処理、サインイン、更新、アクセス制御の手順があります。テスト用トークンと架空の識別情報なので、シード値と状態をテストの設定に含めてください。

## 意図して初期化する

初期データを前提にするテストでは、リセットするか、新しいAPIを作ります。書き込み後の読み込みを試す場合は、同じAPIを使います。[関連データの取得](queries-and-relations.md)では、シード値や言語・地域を変えたときに別の変更状態になる理由を説明しています。

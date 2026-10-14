---
title: 読み込みとエラーを再現する
section: how-to
order: 3
description: クライアントを変えずに、遅延、失敗、ステータス、ストリームの制御を使います。
---

## ステータスを指定する

`status`を明示すると、同じエラー画面を再現できます。ステータス、本文、ヘッダーを実際に確認し、JSONの本文だけで成功と判断しないでください。

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false });
const down = await api.request("/users?seed=7&status=503");
console.log(down.status, down.headers.get("retry-after"));
```

## 遅い応答や分割した本文を試す

`delay`は応答の遅延、`trickle`は本文の分割送信、`fail`はシード値で再現できる失敗率のテストに使います。[HTTPガイド](../../api-guide.md)で単位、範囲、制御パラメーターを確認してください。読み込み状態は別に検証し、再試行でもシード値やフィルターを維持します。

```sh
curl 'http://localhost:6800/users?seed=7&limit=2&delay=1000'
```

## イベントは別の経路を使う

`/streams`は、再接続や途中切断を試せる、上限付きのServer-Sent Eventsを返します。ブラウザー内のAPIはfetchに応答しますが、標準の`EventSource`にはNodeサーバーが必要です。[ストリームの契約](../../streams.md)で接続時間とイベント数の上限を確認してください。[トラブルシューティング](troubleshooting.md)では、拒否されたリクエストと意図して再現した失敗を区別します。

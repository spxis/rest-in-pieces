---
title: ブラウザーのfetch、MSW、Viteに接続する
section: how-to
order: 5
description: 開発やテストの環境に合わせてアダプターを選び、実際のリクエスト経路を保ちます。
---

## ローカルのfetch関数

[inBrowserFetch](api:inBrowserFetch)は、指定したオリジンとパスの範囲だけを、必要になったときに読み込むAPIへ渡します。ほかのリクエストは元のfetchに渡します。この絶対URLはNodeでもブラウザーでも使え、一致するAPIリクエストではネットワーク通信を行いません。

```ts
import { inBrowserFetch } from "@johnmorrisdotca/rest-in-pieces/browser";
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const localFetch = inBrowserFetch("https://example.test/api", async () => createApp({ log: false }), fetch);
console.log((await localFetch("https://example.test/api/users?seed=7&limit=2")).status);
```

## アダプターを登録して解除する

[installInBrowserApi](api:installInBrowserApi)は解除用の関数を返します。ブラウザー内の相対パスはページのURLを基準に解決します。ブラウザー外では絶対URLを指定します。テストやページで不要になったら解除してください。

```ts no-run
import { installInBrowserApi } from "@johnmorrisdotca/rest-in-pieces/browser";

const restore = installInBrowserApi({ base: "/api", app: { log: false } });
try { console.log((await fetch("/api/users?seed=7&limit=2")).status); }
finally { restore(); }
```

## MSWとVite

MSW自身の`http`を渡します。`/msw`は実行時にMSWをインポートしません。MSW 3では`msw/http`、MSW 2では`msw`から取得します。Node用ハンドラーには絶対URLが必要で、ワーカーやサーバーの起動は呼び出す側で行います。

```ts
import { http } from "msw/http";
import { restInPiecesHandlers } from "@johnmorrisdotca/rest-in-pieces/msw";

const handlers = restInPiecesHandlers({ http, base: "https://example.test/api", app: { log: false } });
console.log(handlers.length);
```

```ts
import { restInPieces } from "@johnmorrisdotca/rest-in-pieces/vite";

console.log(restInPieces({ base: "/api", app: { log: false } }).name);
```

Viteプラグインは開発用サーバーで使い、本番のバックエンドにはなりません。[既存の接続手順](../../use-with.md)では、クライアントやテストの設定と解除を説明しています。[埋め込み](native-embeds.md)では、ホストページのfetchを書き換える必要はありません。

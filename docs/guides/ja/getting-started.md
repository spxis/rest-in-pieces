---
title: はじめに
section: tutorial
order: 1
description: ローカルAPIを起動する方法と、SDKからシード値で固定したデータを取得する方法。
---

## 動かし方を選ぶ

CLIではNodeサーバーとプレイグラウンドを起動します。コアSDKはメモリ内で`Request`に応答するため、ポートを開きません。ブラウザー用アダプター、MSWハンドラー、Viteプラグインも同じコアを使います。公開プレイグラウンドでは、APIがタブ内で動きます。

```sh
npx @johnmorrisdotca/rest-in-pieces --port 6800
```

`http://localhost:6800/`を開くか、`http://localhost:6800/users?seed=7&limit=2`を取得します。シード値、データの言語・地域、クエリーが同じなら、同じデータを再現できます。人名は架空のものですが、国や行政区分の参照データは実在する情報です。

## コアSDKを使う

```sh
npm install @johnmorrisdotca/rest-in-pieces
```

```ts
import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";

const api = createApp({ log: false, safe: true });
const response = await api.request("/users?seed=7&limit=2");
console.log(response.status);
```

`createApp`で作ったAPIは、それぞれ独立しています。セッションの書き込みを保持する場合は同じインスタンスを使い、テストを初期状態に戻す場合は新しいインスタンスを作ります。メインのインポートは、ビルド済みプレイグラウンドを配信できるNodeアプリです。`/core`ではNodeの静的ファイル配信を含めません。

## 次の手順

[データの検索](queries-and-relations.md)、[読み込みとエラーの再現](loading-and-errors.md)、[フロントエンドへの接続](browser-and-frameworks.md)、[OpenAPIからのモック作成](openapi-mocks.md)を参照してください。[HTTP APIガイド](../../api-guide.md)には、ルートと制御パラメーターの詳細があります。[SDKの一覧](entry:main)では、確認済みのインポートと実行例を読めます。

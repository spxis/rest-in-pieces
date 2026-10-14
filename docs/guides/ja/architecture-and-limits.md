---
title: 構成と上限
section: explanation
order: 10
description: 共通コア、パッケージのエントリー、生成の上限、サイズ測定の対象を説明します。
---

## 共通のコアとアダプター

`createApp`は、リソース、制御、スキーマ、リクエスト処理を組み合わせます。Nodeアプリは環境変数の設定とプレイグラウンドの静的配信を加えます。ブラウザーのfetch、MSW、Viteは、別のデータセットを実装せず同じコアを使います。変換関数とSVG画像の関数は独立したエントリーなので、それだけが必要な場合は個別にインポートできます。

## サイズの測定対象

メインのバッジは、Nodeエントリーと依存するコード・データをまとめ、ES2020向けに縮小し、gzipレベル9で圧縮した値です。Nodeの組み込みモジュールは外部のままです。ViteエントリーもNodeを対象にし、ほかの実行用エントリーはneutralを使います。生成したOpenAPIの型には参照ページがありますが、JavaScriptのサイズはありません。インストールするtarballやPagesのダウンロード量とは別の測定です。

## 上限と任意のデータ

セッション、OpenAPIドキュメント、生成する値、ストリーム、画像寸法、埋め込みには、それぞれ標準の上限があります。[SDK](entry:core)、[モックの上限](api:MOCK_LIMITS)、[セッションの上限](api:SessionLimits)、[既存のHTTP・構成の説明](../../api-guide.md)を参照してください。[架空の患者データ](../../synthetic-patients.md)、[スキーマからの生成](../../schema-generation.md)、[カスタム項目](../../custom-fields.md)、[オフライン生成](../../offline-generator.md)も保持しています。

## ドキュメントの更新箇所

SDKの参照ページはソースのコメントから作ります。ビルドスクリプトがOpenAPIのスキーマと型を書き、`scripts/docs-openapi.ts`が5つの公開型のコメントを供給します。TypeScript 7では、開発用のJavaScript APIでドキュメントを読み、SDKのビルドと例の型検査には標準のTypeScript 7 CLIを使います。ガイド、変更履歴、README、ワークフローはリポジトリーのルート、公開SDKは`apps/api`に置きます。

## プレイグラウンドの画像

[![The REST in Pieces playground](https://raw.githubusercontent.com/spxis/rest-in-pieces/main/docs/art/playground.png)](https://spxis.github.io/rest-in-pieces/)

[元の構成図と詳しい説明](../../architecture.md)。

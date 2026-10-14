---
title: トラブルシューティングとFAQ
section: troubleshooting
order: 11
description: 不正なクエリー、任意データの不足、空の出力、解除漏れを確認します。
---

## 想定した応答と違う

実際のHTTPステータスとエラー本文を確認します。`status`、`fail`、`delay`、`trickle`、認証、セッションを意図して設定していないか確認してください。シード値、言語・地域、データセット、フィルターを同じにします。別の検索条件のカーソルは拒否されます。[HTTPガイド](../../api-guide.md)で制御を確認し、[読み込み・エラーの手順](loading-and-errors.md)で失敗を再現できます。

## null、undefined、空の出力

操作に本文の定義がなければ、`MockOperationInfo.body`はnullです。生成できる応答がなければ`status`はundefinedです。`hexColour`は、値がundefinedまたは不正なら代替色を使います。CSVはnullとundefinedを空のセル、NDJSONはnullのレコードをJSONのnull、SQLは存在しない値、null、undefined、有限でない数値をNULLにします。空の入力では、定義された空文字列を返します。[モック](entry:mock)、[画像](entry:images)、[変換関数](entry:serialize)の契約を確認してください。

## 設定やリソースのエラー

要素を作る前に登録するか、[defineTable](api:defineTable)で登録します。ブラウザー内の相対fetchにはページのURLが必要で、Nodeでは絶対URLを使います。グローバルfetchのアダプターは、所有する処理が終わったら解除します。ViteのAPIは開発時だけ動きます。任意の地図・旗のパッケージがなければ標準のエラーを返します。不正なSQLテーブル名では[SqlTableError](api:SqlTableError)、不正または大きすぎるOpenAPIでは[OpenApiError](api:OpenApiError)が発生します。

## 型やドキュメントが古い

ドキュメントの検査前にリポジトリーをビルドします。OpenAPIの宣言は生成されるため、ビルド済み`.d.ts`ではなく、その生成スクリプトを編集します。リクエストの型は[生成された型](entry:types)、実際のルートはAPIのOpenAPIドキュメントで確認します。[移行ガイド](upgrading.md)では3.0の安全な値への変更を説明しています。

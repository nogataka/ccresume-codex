# デプロイ手順

このドキュメントでは、`@nogataka/ccresume-codex` パッケージを npm へ公開するまでのフローを解説します。GitHub Actions による自動デプロイが前提です。

## 前提条件

- リポジトリに `NPM_TOKEN` シークレットが設定されていること。
  - npm の *automation* トークン (publish 権限付き) を `Settings > Secrets and variables > Actions` で登録します。
- `main` ブランチにデプロイ対象の変更がマージ済みで、ローカルで `npm ci && npm run lint && npm run typecheck && npm test` が通っていること。
- Node.js 18 以上の環境が手元にあり、`npm` CLI が利用できること。

## リリース作業フロー

1. **バージョン番号の更新**  
   変更内容に応じて適切なバージョンバンプを行います。例: `npm version patch`
   - コマンド実行後、自動でコミットとタグ `vX.Y.Z` が作成されます。
   - 追加の変更がある場合はコミットしておきます。

2. **リモートへ push**  
   作成されたコミットとタグをリモートへ送信します。
   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```
   もしくは `git push origin main --follow-tags` を使用します。

3. **GitHub Actions の確認**  
   タグ `v*` の push をトリガーに `.github/workflows/release.yml` が実行されます。ワークフローでは以下を実施します。
   - `package.json` のバージョンとタグの一致チェック
   - `npm ci`
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm publish --access public`
   実行結果はリポジトリの Actions タブで確認できます。

4. **npm 公開の確認**  
   ワークフローが完了すると npm 上の `@nogataka/ccresume-codex` が更新されます。`npm view @nogataka/ccresume-codex version` でバージョンを確認してください。

## 手動実行 (オプション)

GitHub の Actions から `Release` ワークフローを手動起動することも可能です。この場合も `package.json` のバージョンがタグと同一である必要があります。

## よくあるトラブルと対処

- **Version mismatch:** タグと `package.json` のバージョンが一致しないとワークフローが失敗します。`npm version` で再生成するかタグを削除して作り直します。
- **npm publish の認証失敗:** `NPM_TOKEN` が未設定または権限不足です。Publish 権限付きの automation トークンで再設定してください。
- **テスト・Lint の失敗:** ローカルで `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` を実行し、通る状態でタグを作成し直してください。

## デプロイ後の確認

- `npx @nogataka/ccresume-codex@latest` を実行し、最新機能が反映されているか確認します。
- 変更点が README やドキュメントに反映されていることを確認し、必要に応じてリリースノートや Issue を更新します。

以上でデプロイ作業は完了です。

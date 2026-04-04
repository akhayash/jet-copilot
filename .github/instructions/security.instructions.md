# Security Guidelines

## Input Validation

### Path Traversal
- `copilotSessionId` は UUID 形式のみ許可: `UUID_RE = /^[0-9a-f]{8}-...$/i`
- ファイルパスは `isPathSafe()` で検証（null byte、システムディレクトリ拒否）
- `path.resolve()` で正規化してからチェック

### XSS Prevention
- **Frontend HTML**: `AppUtils.escapeHtml()` で全ユーザー入力をエスケープ
- **textContent**: 動的テキストは `.textContent` 使用（`.innerHTML` は escapeHtml 必須）
- **onclick 属性内**: `escapeJsString()` で JS 文字列をエスケープ

### Request Validation
- 必須パラメータの早期チェック → `400 { error }`
- リソース存在確認 → `404 { error }`
- ファイルアップロードサイズ制限: 10MB（multer）

## 認証・アクセス制御

### Dev Tunnels
- `--allow-anonymous` は**使用しない** — 認証必須
- Microsoft / Entra ID アカウントでログイン
- トンネル ID は `TUNNEL_ID_PATTERN = /^[a-zA-Z0-9-]+$/` で検証

### GH_TOKEN
- `.env` ファイルから読み込み（`load-env.js`）
- Docker 環境では環境変数経由
- **ソースコードにコミットしない**

## 依存関係管理

### Dependabot
- `dependabot.yml` でセキュリティアラートを自動 PR 化
- セキュリティ PR は優先的にレビュー・マージ
- CVE 対応例: path-to-regexp 8.3.0 → 8.4.2（CVE-2026-4926, CVE-2026-4923）

### 対応フロー
1. Dependabot PR が届く
2. `npm test && npm run lint` で破壊的変更がないか確認
3. セキュリティ修正は即マージ推奨
4. major version bump は影響確認後

## ファイルシステムアクセス

### 読み取り
- `copilot-session-scanner.js`: `~/.copilot/session-state/` のみアクセス
- UUID バリデーション済みの ID でパスを構築

### 書き込み
- `adoptSession()`: events.jsonl を書き換え（.bak バックアップ必須）
- `cleanStaleLocks()`: lock ファイル削除のみ
- アップロード: セッション cwd 配下のみ

## コードレビューチェックリスト

新しいエンドポイントやファイル操作を追加する際:

- [ ] ユーザー入力がファイルパスに使われていないか？（UUID バリデーション必須）
- [ ] HTML 出力に `escapeHtml()` を適用しているか？
- [ ] エラーレスポンスが `{ error: string }` 形式か？
- [ ] `try/catch` でエラーハンドリングしているか？
- [ ] 新しい依存パッケージのセキュリティを確認したか？

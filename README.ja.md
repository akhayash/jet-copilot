# 🚀 Jet Copilot

[English](README.md) | **日本語**

モバイルやデスクトップのブラウザからGitHub Copilot CLIをリモート操作するWebアプリ。

ローカルPCで`copilot`の対話セッションを起動し、[xterm.js](https://xtermjs.org/)によるフルターミナルエミュレーションでブラウザに中継します。[Microsoft Dev Tunnels](https://learn.microsoft.com/azure/developer/dev-tunnels/)で安全にインターネット公開し、QRコードで即アクセス。

## アーキテクチャ

```
ブラウザ (任意デバイス)  ── HTTPS ──  Dev Tunnels (Microsoft Cloud)  ── tunnel ──  ローカルPC
                                                                                   ├── Node.js (Express + WebSocket)
                                                                                   ├── node-pty (PTY)
                                                                                   └── copilot (対話セッション)
```

## 前提条件

- **Node.js** v18以上
- **GitHub Copilot CLI** (`copilot` コマンドが使えること)
  - インストール: `npm install -g @github/copilot`
  - 認証: `copilot login`
- **Microsoft Dev Tunnels CLI** (`devtunnel` コマンド)
  - Windows: `winget install Microsoft.devtunnel`
  - macOS: `brew install --cask devtunnel`
  - Linux: `curl -sL https://aka.ms/DevTunnelCliInstall | bash`
  - 認証: `devtunnel user login -g` (GitHubアカウント)
    または `devtunnel user login -e` (Microsoft / Entra ID アカウント)
- **Windows / macOS / Linux**
- **ビルドツール** (node-ptyのネイティブコンパイルに必要、`npm install`時に使用):
  - Windows: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（C++ワークロード）
  - macOS: `xcode-select --install`
  - Linux: `sudo apt install build-essential`

## セットアップ

```bash
# 1. クローン
git clone https://github.com/akhayash/jet-copilot.git
cd jet-copilot

# 2. 依存パッケージインストール
npm install

# 3. Dev Tunnelsにログイン（初回のみ）
devtunnel user login -g    # GitHubアカウント
# または: devtunnel user login -e  (Microsoft / Entra ID アカウント)
```

### `.env` の設定（オプション）

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `PORT` | サーバーのポート番号 | `4117` |
| `DEVTUNNEL_ID` | 永続トンネル ID（再起動しても URL が変わらない） | _（未設定 — 一時トンネルを使用）_ |

## 使い方

### 1. サーバー起動

```bash
node server/index.js
# または
npm start
# オプション付き
npx jet-copilot --port 8080 --tunnel-id my-tunnel
```

**CLI オプション:**

| オプション | 短縮 | 説明 | デフォルト |
|-----------|------|------|-----------|
| `--port` | `-p` | サーバーポート | `4117` |
| `--tunnel-id` | `-t` | 永続 Dev Tunnel ID | _（なし）_ |
| `--help` | `-h` | ヘルプ表示 | |

ターミナルに以下が表示されます：
- 🚀 サーバーURL（localhost）
- 🔗 Dev TunnelのパブリックURL
- 📱 **QRコード**（スマートフォンのカメラで読み取り）

### 2. ブラウザから接続

1. QRコードをスマートフォンのカメラで読み取る、またはURLを任意のブラウザで開く
2. Dev Tunnelの認証（GitHub or Microsoftアカウントでログイン）
3. **ダッシュボード**が表示される

### 3. セッション管理（ダッシュボード）

- **New Session**: 作業ディレクトリを選択し、新しいCopilot CLIセッションを開始
- **Connect**: 既存のアクティブセッションに接続
- **End**: セッションを終了
- フォルダピッカーでディレクトリをタップ選択（手打ち不要）
  - **検索 / フィルター**: テキスト入力でフォルダをリアルタイム絞り込み（大文字小文字区別なし）
- **New Folder**: フォルダピッカーから新しいディレクトリを作成
- 複数セッションを異なるリポジトリで同時に運用可能
- **ステータス表示**: 🟢 アクティブ / ⚫ 終了、接続中クライアント数バッジ付き
- **稼働時間表示**: ステータスバーにサーバー稼働時間を表示
- **バージョン & 更新**: フッターに現在のバージョンを表示。🔄 Update ボタンで最新コードを取得して再起動

### 4. ターミナル機能

[xterm.js](https://xtermjs.org/) v6 によるフルインタラクティブターミナル。URL は自動でクリック可能リンクになります。

- **再接続リプレイ**: 接続が切れても自動再接続し、直近 100 KB の出力をリプレイ。コンテキストを失いません

#### ショートカットバー（下部）

モバイルで親指から操作しやすい位置にキーコマンドを配置:

| ボタン | 動作 |
|--------|------|
| **ESC** | Copilot操作のキャンセル |
| **Mode** | Copilot CLIのモード切替（Shift+Tab送信） |
| **↑ ↓** | メニュー・選択肢のナビゲーション |
| **Enter** | 選択の確定 |
| **Enqueue** | Copilot CLIに入力をキュー（Ctrl+Q送信） |
| **Reset** | **短押し** — ソフトリセット（画面クリア・TUI再描画）。**長押し（1秒以上）** — Copilot CLIプロセスをハードリスタート（確認ダイアログあり） |
| **KB** | キーボードロック切替（キーボード表示を抑制） |

#### ヘッダーツール

ヘッダーにアイコンのみのツールボタンを配置。使用頻度の低いアクション用:

| アイコン | 機能 | 詳細 |
|----------|------|------|
| 🌐 **Preview** | ローカルサービスのプレビュー管理 | ポート番号を入力してプレビューを開く。アクティブなプレビューの一覧・停止（ダッシュボードのプレビューと同等） |
| 📎 **Upload** | 画像のアップロード | デバイスから画像を選択（最大10 MB）。セッションディレクトリの `.copilot-uploads` に保存され、`@ファイルパス` としてCopilot CLIに送信 |
| 📋 **Paste** | クリップボードから貼り付け | クリップボードのテキストまたは画像を読み取り。テキストはそのままターミナルへ送信、画像は自動アップロード |
| ⌨️ **Text** | マルチラインテキスト入力 | テキストエリアを表示。**Enter** で改行、**Ctrl+Enter**（Macは Cmd+Enter）で送信 |
| 📸 **Capture** | ウィンドウキャプチャ | サーバーマシン上の任意のウィンドウをスクリーンショット（下記 [ウィンドウキャプチャ](#ウィンドウキャプチャ) 参照） |
| 💬 **History** | 会話履歴 | 現在のセッションの会話履歴を表示 |

#### ウィンドウキャプチャ

1. 📸 をタップ → ドロップダウンからウィンドウを選択 → **Capture**
2. モーダルにスクリーンショットとサイズが表示される
3. モーダル内のアクション:
   - **Re-capture** — 同じウィンドウを再キャプチャ
   - **Copy Path** — 画像ファイルパスをクリップボードにコピー
   - **Send to CLI** — `@ファイルパス` としてCopilot CLIに送信
4. モーダル外のタップまたは **ESC** キーで閉じる

ウィンドウキャプチャはダッシュボードの Capture セクションからも利用できます。

### 5. ローカルサービスのプレビュー

Copilot CLIで開発中のWebサービスをブラウザで確認できます。

1. ダッシュボードのPreviewセクション **または** ターミナルヘッダーの Preview ボタンでポート番号を入力
2. 「Open」をタップ → Dev Tunnelが追加で起動
3. 表示されるURLを開く → ブラウザでプレビュー
4. アクティブなプレビューは5秒ごとに更新。**Stop** でトンネルを終了

## REST API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/status` | サーバー状態（稼働時間、セッション数、キャプチャ可否） |
| GET | `/api/version` | バージョン情報と更新可能フラグ |
| POST | `/api/update` | `git pull` → 再起動でセルフアップデート |
| GET | `/api/sessions` | 全セッション一覧 |
| GET | `/api/sessions/:id` | セッション詳細 |
| POST | `/api/sessions` | 新規セッション作成 |
| DELETE | `/api/sessions/:id` | セッション終了 |
| GET | `/api/browse` | ディレクトリ参照 |
| POST | `/api/mkdir` | ディレクトリ作成 |
| GET | `/api/copilot-sessions` | Copilot CLI セッション履歴一覧 |
| POST | `/api/upload` | 画像をセッションの cwd にアップロード |
| GET | `/api/preview` | アクティブなプレビュートンネル一覧 |
| POST | `/api/preview` | プレビュートンネル開始 |
| DELETE | `/api/preview/:port` | プレビュートンネル停止 |
| GET | `/api/windows` | サーバー上のキャプチャ可能ウィンドウ一覧 |
| POST | `/api/capture` | ウィンドウスクリーンショット |
| GET | `/api/captures/:filename` | キャプチャ画像配信 |
| GET | `/api/tunnel` | アクティブな Dev Tunnel URL 取得 |
| GET | `/api/qrcode` | URL の QR コード SVG 生成 |
| GET | `/health` | ヘルスチェック |

## ファイル構成

```
jet-copilot/
├── .env                      # ポート設定（オプション）
├── package.json
├── eslint.config.js          # ESLint 9 フラットコンフィグ
├── bin/
│   └── jet-copilot.js        # リスタートラッパー（exit 100 → 再fork）
├── server/
│   ├── index.js              # Express + WebSocket + APIサーバー
│   ├── copilot-runner.js     # node-ptyでcopilot起動・I/O中継
│   ├── session-manager.js    # セッション管理（出力リプレイバッファ付き）
│   ├── session-context.js    # リポジトリルート検出（セッションコンテキスト）
│   ├── copilot-session-scanner.js # Copilot CLIセッション履歴スキャン
│   ├── yaml-lite.js          # workspace.yaml用ミニYAMLパーサー
│   ├── preview-manager.js    # プレビュートンネル管理
│   ├── window-capture.js     # クロスプラットフォーム ウィンドウスクリーンショット
│   ├── tunnel.js             # Dev Tunnel自動起動 + QRコード表示
│   └── load-env.js           # .envローダー（cwd優先）
├── public/
│   ├── index.html            # ダッシュボード
│   ├── terminal.html         # ターミナル画面
│   ├── dashboard.js          # ダッシュボードロジック
│   ├── app.js                # xterm.js + WebSocket通信
│   ├── app-utils.js          # 共有ユーティリティ（browser/CommonJS両対応）
│   └── style.css             # ダークモードUI（Lucide Icons CDN使用）
└── test/                     # テスト（node:test + supertest）
    ├── api.test.js
    ├── app-utils.test.js
    └── ...
```

## セキュリティ

- **Dev Tunnels**: HTTPS自動適用、GitHub/Microsoftアカウント認証によるアクセス制御
- **`.env`**: `.gitignore` に含まれており、リポジトリにコミットされません

## ライセンス

[MIT](LICENSE)

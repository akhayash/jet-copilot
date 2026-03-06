# ✈️ Jet Copilot

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
- **Windows / macOS / Linux**

## セットアップ

```bash
# 1. クローン
git clone <your-repo-url>
cd jet-copilot

# 2. 依存パッケージインストール
npm install

# 3. Dev Tunnelsにログイン（初回のみ）
devtunnel user login -g    # GitHubアカウント
# または: devtunnel user login -m  (Microsoftアカウント)
```

### `.env` の設定（オプション）

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `PORT` | サーバーのポート番号 | `3000` |

## 使い方

### 1. サーバー起動

```bash
node server/index.js
```

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
- **New Folder**: フォルダピッカーから新しいディレクトリを作成
- 複数セッションを異なるリポジトリで同時に運用可能

### 4. ターミナル機能

- [xterm.js](https://xtermjs.org/) v6 によるフルインタラクティブターミナル
- **ESCボタン**: タップでEscapeキーを送信（Copilot操作のキャンセル）
- **Modeボタン**: タップでShift+Tabを送信（Copilot CLIのモード切替）
- **🎙 音声入力**: フローティングマイクボタンから音声でテキスト入力 → ターミナルに送信（モバイルIMEの問題を回避）

### 5. ローカルサービスのプレビュー

Copilot CLIで開発中のWebサービスをブラウザで確認できます。

1. ダッシュボードのPreviewセクションでポート番号を入力（例: `3001`）
2. 「▶ Open」をタップ → Dev Tunnelが追加で起動
3. 表示されるURLを開く → ブラウザでプレビュー

## ファイル構成

```
jet-copilot/
├── .env                      # ポート設定（オプション）
├── .gitignore
├── package.json
├── server/
│   ├── index.js              # Express + WebSocket + APIサーバー
│   ├── auth.js               # 認証ユーティリティ
│   ├── copilot-runner.js     # node-ptyでcopilot起動・I/O中継
│   ├── session-manager.js    # セッション管理
│   ├── preview-manager.js    # プレビュートンネル管理
│   └── tunnel.js             # Dev Tunnel自動起動 + QRコード表示
└── public/
    ├── index.html            # ダッシュボード
    ├── terminal.html         # ターミナル画面
    ├── dashboard.js          # ダッシュボードロジック
    ├── app.js                # xterm.js + WebSocket通信
    └── style.css             # ダークモードUI
```

## セキュリティ

- **Dev Tunnels**: HTTPS自動適用、GitHub/Microsoftアカウント認証によるアクセス制御
- **`.env`**: `.gitignore` に含まれており、リポジトリにコミットされません

## ライセンス

Private

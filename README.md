# 🤖 Jet Copilot

iPhoneのブラウザからGitHub Copilot CLIをリモート操作するWebアプリ。

ローカルPCで`copilot`の対話セッションを起動し、[xterm.js](https://xtermjs.org/)によるフルターミナルエミュレーションでiPhoneに中継します。[Microsoft Dev Tunnels](https://learn.microsoft.com/azure/developer/dev-tunnels/)で安全にインターネット公開し、QRコードで即アクセス。

## アーキテクチャ

```
iPhone (Safari)  ── HTTPS ──  Dev Tunnels (Microsoft Cloud)  ── tunnel ──  ローカルPC
                                                                           ├── Node.js (Express + WebSocket)
                                                                           ├── node-pty (PTY)
                                                                           └── copilot (対話セッション)
```

## 前提条件

- **Node.js** v18以上
- **GitHub Copilot CLI** (`copilot` コマンドが使えること)
  - インストール: `npm install -g @githubnext/github-copilot-cli`
  - 認証: `copilot login`
- **Microsoft Dev Tunnels CLI** (`devtunnel` コマンド)
  - インストール: `winget install Microsoft.devtunnel`
  - 認証: `devtunnel user login -g` (GitHubアカウント)
- **Windows** (node-pty が Windows PTY を使用)

## セットアップ

```bash
# 1. クローン
git clone https://github.com/akhayash/jet-copilot.git
cd jet-copilot

# 2. 依存パッケージインストール
npm install

# 3. 環境変数を設定
cp .env.example .env   # または .env を直接編集
# APP_TOKEN に任意のパスワードを設定
```

### `.env` の設定

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `APP_TOKEN` | iPhoneからの接続時に入力する認証トークン | `change-me-to-a-secure-token` |
| `PORT` | サーバーのポート番号 | `3000` |

## 使い方

### 1. サーバー起動

```bash
node server/index.js
```

ターミナルに以下が表示されます：
- 🚀 サーバーURL（localhost）
- 🔗 Dev TunnelのパブリックURL
- 📱 **QRコード**（iPhoneのカメラで読み取り）

### 2. iPhoneから接続

1. QRコードをiPhoneのカメラで読み取る
2. Safariでページが開く
3. トークン（`.env` の `APP_TOKEN`）を入力して **Connect**
4. Copilot CLIのターミナルが表示される
5. そのまま入力・操作が可能

## ファイル構成

```
jet-copilot/
├── .env                    # 認証トークン・ポート設定
├── .gitignore
├── package.json
├── server/
│   ├── index.js            # Express + WebSocketサーバー
│   ├── auth.js             # トークン認証
│   ├── copilot-runner.js   # node-ptyでcopilot起動・I/O中継
│   └── tunnel.js           # Dev Tunnel自動起動 + QRコード表示
└── public/
    ├── index.html          # 認証画面 + ターミナル画面
    ├── style.css           # ダークモードUI
    └── app.js              # xterm.js + WebSocket通信
```

## セキュリティ

- **Dev Tunnels**: HTTPS自動適用、Microsoft/GitHub認証によるアクセス制御
- **アプリ認証**: Bearer Token（`APP_TOKEN`）による二重認証
- **`.env`**: `.gitignore` に含まれており、リポジトリにコミットされません

## ライセンス

Private

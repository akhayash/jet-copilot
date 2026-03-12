# jet-copilot Azure Deployment

[English](README.md) | **日本語**

Azure VM + Docker で jet-copilot をデプロイする手順。

## アーキテクチャ

```
ブラウザ ── HTTPS ── Dev Tunnels ── Azure VM (Ubuntu 24.04 + Docker)
                                      └── jet-copilot コンテナ
                                            ├── copilot CLI
                                            └── devtunnel CLI
SSH 管理 ── Azure Bastion (Developer SKU, 無料)
```

## 前提条件

- [Azure CLI](https://aka.ms/installazurecli) インストール済み
- SSH 鍵ペア（`~/.ssh/id_rsa.pub`）
- Azure サブスクリプション

## デプロイ

```bash
# デフォルト: rg=jet-copilot-rg, location=japaneast, vm=jet-copilot-vm
./infra/deploy.sh

# カスタム（リージョン変更）
./infra/deploy.sh my-rg eastus my-vm
```

cloud-init による自動セットアップ（2-3分）:
- Docker Engine インストール
- ワークスペース・認証ディレクトリ作成

deploy.sh による追加セットアップ（3-5分）:
- cloud-init 完了待ち
- jet-copilot リポジトリ clone
- Docker イメージビルド

## 初回セットアップ

デプロイ直後、Docker イメージはビルド済みですが、まだ起動していません。
認証を設定してからコンテナを起動します。

> 💡 VM にはブラウザ不要です。デバイスコードフローの URL を手元の PC で開きます。

### 1. SSH 接続

Azure Portal → VM → Connect → Bastion（ブラウザ SSH）。

### 2. GitHub PAT の作成と設定

Docker コンテナにはキーチェーンがないため、**GitHub Fine-grained PAT** で認証します。
1つの PAT で **Copilot CLI** と **Git** の両方を認証できます。

#### PAT 作成手順

1. https://github.com/settings/personal-access-tokens/new を開く
2. 名前: `jet-copilot-vm`、有効期限: 任意（最大1年）
3. **Repository access**: jet-copilot で使うリポジトリ、または All repositories
4. **Permissions** で以下を追加:
   - **Copilot Requests** — Copilot CLI の認証に必要
   - **Contents** (Read and write) — Git clone/push に必要
5. Generate token → トークンをコピー

#### VM に設定

```bash
cd ~/jet-copilot
echo 'GH_TOKEN=github_pat_XXXX...' > .env
chmod 600 .env
```

> ⚠️ `.env` は `.gitignore` に含まれており、リポジトリにはコミットされません。

この `GH_TOKEN` は `docker-compose.yml` 経由でコンテナに渡され、以下の用途で自動的に使われます:
- **Copilot CLI**: `GH_TOKEN` 環境変数を自動検出（ブラウザ認証不要）
- **Git**: credential helper 経由で `git clone` / `git push` に使用

### 3. Dev Tunnels 認証

一時コンテナで Dev Tunnels の認証を行います。
この認証情報は `~/DevTunnels` にボリュームマウントされ、コンテナ再起動後も保持されます。

**Microsoft 個人アカウント（推奨）:**

```bash
docker compose run --rm jet-copilot devtunnel user login -e -d
```

**GitHub アカウント:**

```bash
docker compose run --rm jet-copilot devtunnel user login -g -d
```

> ⚠️ Dev Tunnels のブラウザアクセスには、トンネル作成時と同じアカウントでログインが必要です。
> GitHub 認証の場合、サービス側の不具合で 403 になることがあります（[microsoft/dev-tunnels#578](https://github.com/microsoft/dev-tunnels/issues/578)）。
> Microsoft 個人アカウントでの認証が安定しています。

### 4. コンテナ起動

```bash
docker compose up -d
```

ログに Dev Tunnels の URL が表示されます:

```bash
docker compose logs -f
# ✅ Tunnel ready: https://xxxx-3000.use.devtunnels.ms
```

この URL にブラウザでアクセスすると、jet-copilot ダッシュボードが開きます。
Dev Tunnels の認証に使ったアカウントでブラウザからログインしてください。

## 認証まとめ

| 認証 | 用途 | 保存先 | 方法 |
|------|------|--------|------|
| `GH_TOKEN` (PAT) | Copilot CLI + Git | `~/jet-copilot/.env` | Fine-grained PAT |
| Dev Tunnels | トンネル接続 | `~/.devtunnels/` → `~/DevTunnels` | `devtunnel user login` |

> **ローカル PC（Windows/macOS）** ではキーチェーンがあるため、ブラウザ認証だけで動きます。
> PAT や `.env` の設定は不要です。

## ボリューム

| ホスト | コンテナ | 用途 |
|--------|----------|------|
| `~/workspace/` | `/workspace/` | 作業ディレクトリ（clone、新規作成）**← デフォルト cwd** |
| `~/.copilot/` | `/home/jetuser/.copilot/` | Copilot セッション履歴（--resume） |
| `~/.devtunnels/` | `/home/jetuser/DevTunnels` | Dev Tunnels 認証 |

`/workspace` はコンテナの起動ディレクトリ（WORKDIR）です。
ダッシュボードやCopilot CLI セッションはここを起点に動作します。
`git clone` したリポジトリはホスト側 `~/workspace/` に永続化され、コンテナ再起動後も残ります。

## コスト

| リソース | 月額 |
|----------|------|
| Standard_B2s VM | ~$30 |
| Standard SSD 30GB | ~$2 |
| Azure Bastion Developer | 無料 |
| **合計** | **~$32** |

## 運用

```bash
# コンテナログ確認
docker compose logs -f

# jet-copilot 更新
cd ~/jet-copilot && git pull && docker compose up -d --build

# VM 停止（コスト節約）
az vm deallocate -g jet-copilot-rg -n jet-copilot-vm

# VM 起動
az vm start -g jet-copilot-rg -n jet-copilot-vm
# → docker compose は restart: unless-stopped なので自動再開
```

> ⚠️ `az vm run-command` 経由で `docker compose` を実行する場合は、
> `export HOME=/home/jetuser` を先に実行してください。
> root の `~` が `/root/` に展開され、ボリュームマウントがずれます。
>
> ```bash
> az vm run-command invoke ... --scripts \
>   "export HOME=/home/jetuser && cd ~/jet-copilot && docker compose up -d"
> ```

## リソース削除

```bash
az group delete --name jet-copilot-rg --yes
```

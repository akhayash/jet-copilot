# jet-copilot Azure Deployment

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

# カスタム
./infra/deploy.sh my-rg eastus my-vm
```

cloud-init による自動セットアップ（3-5分）:
- Docker Engine インストール
- jet-copilot リポジトリ clone
- Docker イメージビルド + 起動

## 初回セットアップ

デプロイ後、Azure Bastion 経由で SSH 接続して認証を行う。

### 1. SSH 接続

```bash
# Azure CLI 経由
az network bastion ssh \
  --name jet-copilot-vm-bastion \
  --resource-group jet-copilot-rg \
  --target-resource-id $(az vm show -g jet-copilot-rg -n jet-copilot-vm --query id -o tsv) \
  --auth-type ssh-key \
  --username jetuser \
  --ssh-key ~/.ssh/id_rsa

# または Azure Portal → VM → Connect → Bastion
```

### 2. Copilot CLI 認証

```bash
docker exec -it jet-copilot copilot
# ブラウザで表示された URL にアクセスし、コードを入力
```

### 3. Dev Tunnels 認証

```bash
docker exec -it jet-copilot devtunnel user login -g
# ブラウザで GitHub 認証
```

### 4. コンテナ再起動

```bash
cd ~/jet-copilot && docker compose restart
```

再起動後、Dev Tunnels の URL がログに表示される:

```bash
docker compose logs -f
# ✅ Tunnel ready: https://xxxx-3000.jpe1.devtunnels.ms
```

この URL にブラウザでアクセスすると、jet-copilot ダッシュボードが開く。

## ボリューム

| ホスト | コンテナ | 用途 |
|--------|----------|------|
| `~/workspace/` | `/workspace/` | 作業ディレクトリ（clone、新規作成） |
| `~/.copilot/` | `/home/jetuser/.copilot/` | Copilot 認証 + セッション履歴 |
| `~/.devtunnels/` | `/home/jetuser/.devtunnels/` | Dev Tunnels 認証 |

## コスト

| リソース | 月額 |
|----------|------|
| Standard_B2s VM | ~$30 |
| Standard SSD 30GB | ~$2 |
| Azure Bastion Developer | 無料 |
| **合計** | **~$32** |

Auto-shutdown（デフォルト UTC 15:00 = JST 0:00）で実質 $15-20 に抑制可能。

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

## リソース削除

```bash
az group delete --name jet-copilot-rg --yes
```

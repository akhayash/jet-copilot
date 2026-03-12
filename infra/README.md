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

# カスタム（リージョン変更、private repo は PAT 付き URL）
./infra/deploy.sh my-rg eastus my-vm "https://<PAT>@github.com/akhayash/jet-copilot.git"
```

cloud-init による自動セットアップ（2-3分）:
- Docker Engine インストール
- ワークスペース・認証ディレクトリ作成

deploy.sh による追加セットアップ（3-5分）:
- cloud-init 完了待ち
- jet-copilot リポジトリ clone（private repo 対応）
- Docker イメージビルド

## 初回セットアップ

デプロイ直後、Docker イメージはビルド済みですが、まだ起動していません。
Copilot CLI と Dev Tunnels の認証を行ってからコンテナを起動します。

> 💡 認証はデバイスコードフロー（URL + コードをブラウザで入力）で行います。
> VM にブラウザは不要です。表示された URL を手元の PC のブラウザで開いてください。

### 1. SSH 接続

デプロイ出力に表示された Public IP で直接 SSH します。

```bash
ssh jetuser@<public-ip>
```

または Azure Portal → VM → Connect → Bastion（ブラウザ SSH）。

### 2. Copilot CLI 認証

一時的なコンテナでCopilot CLI を起動し、GitHub アカウントで認証します。

```bash
cd ~/jet-copilot
docker compose run --rm jet-copilot copilot
```

画面に以下のような表示が出ます:

```
To sign in, use a web browser to open https://github.com/login/device
and enter the code XXXX-XXXX to authenticate.
```

手元の PC のブラウザでこの URL を開き、コードを入力してください。
認証完了後、`Ctrl+C` で Copilot を終了します。

### 3. Dev Tunnels 認証

同様に一時コンテナで Dev Tunnels の GitHub 認証を行います。

```bash
docker compose run --rm jet-copilot devtunnel user login -g
```

ブラウザで URL を開き、コードを入力してください。

### 4. コンテナ起動

認証情報はボリュームに保存されています。
コンテナを起動すると、認証済みの状態で Dev Tunnels が接続されます。

```bash
docker compose up -d
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

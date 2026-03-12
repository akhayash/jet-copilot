# jet-copilot Azure Deployment

**English** | [日本語](README.ja.md)

Deploy jet-copilot on an Azure VM with Docker.

## Architecture

```
Browser ── HTTPS ── Dev Tunnels ── Azure VM (Ubuntu 24.04 + Docker)
                                    └── jet-copilot container
                                          ├── copilot CLI
                                          └── devtunnel CLI
SSH management ── Azure Bastion (Developer SKU, free)
```

## Prerequisites

- [Azure CLI](https://aka.ms/installazurecli) installed
- SSH key pair (`~/.ssh/id_rsa.pub`)
- Azure subscription

## Deployment

```bash
# Default: rg=jet-copilot-rg, location=japaneast, vm=jet-copilot-vm
./infra/deploy.sh

# Custom (change region)
./infra/deploy.sh my-rg eastus my-vm
```

cloud-init automatic setup (2-3 min):
- Docker Engine installation
- Workspace and credential directory creation

deploy.sh additional setup (3-5 min):
- Wait for cloud-init to finish
- Clone jet-copilot repository
- Build Docker image

## Initial Setup

After deployment, the Docker image is built but the container is not yet running.
Configure authentication before starting the container.

> 💡 No browser is needed on the VM. Open the device-code-flow URL on your local PC.

### 1. SSH Connection

Azure Portal → VM → Connect → Bastion (browser SSH).

### 2. Create and Configure a GitHub PAT

Docker containers don't have a keychain, so use a **GitHub Fine-grained PAT** for authentication.
A single PAT covers both **Copilot CLI** and **Git**.

#### Creating the PAT

1. Go to https://github.com/settings/personal-access-tokens/new
2. Name: `jet-copilot-vm`, Expiration: your choice (up to 1 year)
3. **Repository access**: repositories used with jet-copilot, or All repositories
4. **Permissions**:
   - **Copilot Requests** — required for Copilot CLI authentication
   - **Contents** (Read and write) — required for Git clone/push
5. Generate token → copy the token

#### Configure on the VM

```bash
cd ~/jet-copilot
echo 'GH_TOKEN=github_pat_XXXX...' > .env
chmod 600 .env
```

> ⚠️ `.env` is in `.gitignore` and will not be committed to the repository.

This `GH_TOKEN` is passed to the container via `docker-compose.yml` and is automatically used for:
- **Copilot CLI**: auto-detected via `GH_TOKEN` environment variable (no browser auth needed)
- **Git**: used for `git clone` / `git push` via credential helper

### 3. Dev Tunnels Authentication

Authenticate Dev Tunnels in a temporary container.
Credentials are volume-mounted to `~/DevTunnels` and persist across container restarts.

**Microsoft personal account (recommended):**

```bash
docker compose run --rm jet-copilot devtunnel user login -e -d
```

**GitHub account:**

```bash
docker compose run --rm jet-copilot devtunnel user login -g -d
```

> ⚠️ Browser access to Dev Tunnels requires logging in with the same account used to create the tunnel.
> GitHub auth may return 403 due to a service-side bug ([microsoft/dev-tunnels#578](https://github.com/microsoft/dev-tunnels/issues/578)).
> Microsoft personal account auth is more reliable.

### 4. Start the Container

```bash
docker compose up -d
```

The Dev Tunnels URL will appear in the logs:

```bash
docker compose logs -f
# ✅ Tunnel ready: https://xxxx-3000.use.devtunnels.ms
```

Open this URL in a browser to access the jet-copilot dashboard.
Log in with the same account used for Dev Tunnels authentication.

## Authentication Summary

| Auth | Purpose | Location | Method |
|------|---------|----------|--------|
| `GH_TOKEN` (PAT) | Copilot CLI + Git | `~/jet-copilot/.env` | Fine-grained PAT |
| Dev Tunnels | Tunnel connection | `~/.devtunnels/` → `~/DevTunnels` | `devtunnel user login` |

> On **local PCs (Windows/macOS)**, the keychain handles auth — browser login is sufficient.
> No PAT or `.env` configuration is needed.

## Volumes

| Host | Container | Purpose |
|------|-----------|---------|
| `~/workspace/` | `/workspace/` | Working directory (clone, create) **← default cwd** |
| `~/.copilot/` | `/home/jetuser/.copilot/` | Copilot session history (--resume) |
| `~/.devtunnels/` | `/home/jetuser/DevTunnels` | Dev Tunnels credentials |

`/workspace` is the container's working directory (WORKDIR).
The dashboard and Copilot CLI sessions use this as their starting point.
Cloned repositories persist on the host at `~/workspace/` across container restarts.

## Cost

| Resource | Monthly |
|----------|---------|
| Standard_B2s VM | ~$30 |
| Standard SSD 30GB | ~$2 |
| Azure Bastion Developer | Free |
| **Total** | **~$32** |

## Operations

```bash
# Check container logs
docker compose logs -f

# Update jet-copilot
cd ~/jet-copilot && git pull && docker compose up -d --build

# Stop VM (save costs)
az vm deallocate -g jet-copilot-rg -n jet-copilot-vm

# Start VM
az vm start -g jet-copilot-rg -n jet-copilot-vm
# → docker compose has restart: unless-stopped, so it auto-restarts
```

> ⚠️ When running `docker compose` via `az vm run-command`, run
> `export HOME=/home/jetuser` first.
> Otherwise `~` resolves to `/root/`, causing volume mount mismatches.
>
> ```bash
> az vm run-command invoke ... --scripts \
>   "export HOME=/home/jetuser && cd ~/jet-copilot && docker compose up -d"
> ```

## Delete Resources

```bash
az group delete --name jet-copilot-rg --yes
```

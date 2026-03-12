#!/bin/bash
set -euo pipefail

# Default values
RESOURCE_GROUP="${1:-jet-copilot-rg}"
LOCATION="${2:-japaneast}"
VM_NAME="${3:-jet-copilot-vm}"
REPO_URL="${4:-https://github.com/akhayash/jet-copilot.git}"

echo "=== jet-copilot Azure Deployment ==="
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location:       $LOCATION"
echo "  VM Name:        $VM_NAME"
echo "  Repo URL:       $REPO_URL"
echo ""

# Check prerequisites
if ! command -v az &> /dev/null; then
  echo "❌ Azure CLI (az) not found. Install: https://aka.ms/installazurecli"
  exit 1
fi

# Get SSH public key
SSH_KEY_PATH="$HOME/.ssh/id_rsa.pub"
if [ ! -f "$SSH_KEY_PATH" ]; then
  echo "❌ SSH public key not found at $SSH_KEY_PATH"
  echo "   Generate one: ssh-keygen -t rsa -b 4096"
  exit 1
fi
SSH_PUBLIC_KEY=$(cat "$SSH_KEY_PATH")

# Ensure logged in
echo "🔑 Checking Azure login..."
az account show > /dev/null 2>&1 || az login

# Create resource group
echo "📦 Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# Deploy Bicep template
echo "🚀 Deploying infrastructure (VM + Bastion)..."
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters \
    vmName="$VM_NAME" \
    sshPublicKey="$SSH_PUBLIC_KEY" \
  --output table

echo ""
echo "⏳ Waiting for cloud-init to finish (Docker install)..."
az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunShellScript \
  --scripts "cloud-init status --wait" \
  --output none

# Clone repo and build Docker image on VM
echo "📥 Cloning repo and building Docker image on VM..."
az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunShellScript \
  --scripts "
    su - jetuser -c 'git clone $REPO_URL /home/jetuser/jet-copilot' &&
    su - jetuser -c 'cd /home/jetuser/jet-copilot && docker compose build'
  " \
  --output table

echo ""
echo "✅ Deployment complete!"
echo ""

# Get public IP
PUBLIC_IP=$(az vm show -g "$RESOURCE_GROUP" -n "$VM_NAME" -d --query publicIps -o tsv)

echo "=== Next Steps ==="
echo ""
echo "1. SSH into the VM:"
echo "   ssh jetuser@${PUBLIC_IP}"
echo ""
echo "2. Authenticate Copilot CLI and Dev Tunnels:"
echo "   cd ~/jet-copilot"
echo "   docker compose run --rm jet-copilot copilot"
echo "   docker compose run --rm jet-copilot devtunnel user login -g"
echo ""
echo "3. Start jet-copilot:"
echo "   docker compose up -d"
echo ""

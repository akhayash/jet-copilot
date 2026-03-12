#!/bin/bash
set -euo pipefail

# Default values
RESOURCE_GROUP="${1:-jet-copilot-rg}"
LOCATION="${2:-japaneast}"
VM_NAME="${3:-jet-copilot-vm}"

echo "=== jet-copilot Azure Deployment ==="
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location:       $LOCATION"
echo "  VM Name:        $VM_NAME"
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
echo "🚀 Deploying infrastructure..."
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters \
    vmName="$VM_NAME" \
    sshPublicKey="$SSH_PUBLIC_KEY" \
  --output table

echo ""
echo "✅ Deployment complete!"
echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Wait a few minutes for cloud-init to finish (Docker + jet-copilot setup)"
echo ""
echo "2. Connect via Azure Bastion:"
echo "   az network bastion ssh \\"
echo "     --name ${VM_NAME}-bastion \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --target-resource-id \$(az vm show -g $RESOURCE_GROUP -n $VM_NAME --query id -o tsv) \\"
echo "     --auth-type ssh-key \\"
echo "     --username jetuser \\"
echo "     --ssh-key $SSH_KEY_PATH"
echo ""
echo "3. Authenticate Copilot CLI and Dev Tunnels:"
echo "   docker exec -it jet-copilot copilot"
echo "   docker exec -it jet-copilot devtunnel user login -g"
echo ""
echo "4. Restart container to apply auth:"
echo "   cd ~/jet-copilot && docker compose restart"
echo ""

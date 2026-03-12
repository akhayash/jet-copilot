FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-optional 2>/dev/null || npm install --omit=dev
COPY . .

FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub Copilot CLI
RUN npm install -g @github/copilot

# Install Dev Tunnels CLI (manual download, no sudo needed in Docker)
RUN ARCH=$(dpkg --print-architecture) && \
    curl -sL "https://aka.ms/DevTunnelCliInstall" -o /tmp/dt-install.sh && \
    sed -i 's/sudo //g' /tmp/dt-install.sh && \
    bash /tmp/dt-install.sh && \
    rm /tmp/dt-install.sh

# Create non-root user
RUN groupadd -r jetuser && useradd -r -g jetuser -m -s /bin/bash jetuser

WORKDIR /app
COPY --from=builder /app .

# Ensure jetuser owns the app
RUN chown -R jetuser:jetuser /app

USER jetuser

EXPOSE 3000

CMD ["node", "server/index.js"]

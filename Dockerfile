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
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub Copilot CLI
RUN npm install -g @github/copilot

# Install Dev Tunnels CLI
RUN curl -sL https://aka.ms/TunnelsCliDownload/linux-x64 -o /usr/local/bin/devtunnel && \
    chmod +x /usr/local/bin/devtunnel

# Create non-root user and make home world-writable (for dynamic UID via docker-compose user:)
RUN groupadd -r jetuser && useradd -r -g jetuser -m -s /bin/bash jetuser && \
    chmod 777 /home/jetuser

WORKDIR /app
COPY --from=builder /app .

# Ensure jetuser owns the app
RUN chown -R jetuser:jetuser /app

EXPOSE 3000

CMD ["node", "server/index.js"]

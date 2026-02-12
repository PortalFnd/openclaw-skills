#!/bin/bash
# Clawtrl Wallet — One-command installer
# Usage:
#   curl -sSL https://raw.githubusercontent.com/PortalFnd/openclaw-skills/main/clawtrl-wallet/install.sh | sudo bash
#   — or —
#   git clone https://github.com/PortalFnd/openclaw-skills.git && cd openclaw-skills/clawtrl-wallet && sudo ./install.sh

set -e

REPO="https://github.com/PortalFnd/openclaw-skills"
RAW="https://raw.githubusercontent.com/PortalFnd/openclaw-skills/main/clawtrl-wallet"
INSTALL_DIR="/opt/clawtrl/signing-proxy"
TOOLS_DIR="/opt/clawtrl/wallet-tools"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Clawtrl Wallet Installer         ║"
echo "  ║     ERC-8128 + x402 + Transfers      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required. Install it first:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  echo "  apt-get install -y nodejs"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js 18+ required (found v$NODE_VERSION)"
  exit 1
fi
echo "[ok] Node.js $(node -v)"

# Check for curl
if ! command -v curl &>/dev/null; then
  echo "ERROR: curl is required"
  exit 1
fi

# Detect if running from cloned repo or via curl pipe
SKILL_DIR=""
if [ -f "$(dirname "$0")/src/signing-proxy.js" ] 2>/dev/null; then
  SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
  echo "[ok] Installing from local clone"
fi

# Create directories
echo ""
echo "[1/6] Creating directories..."
mkdir -p "$INSTALL_DIR/src"
mkdir -p "$TOOLS_DIR"

# Install signing proxy
echo "[2/6] Installing signing proxy..."
if [ -n "$SKILL_DIR" ]; then
  cp "$SKILL_DIR/package.json" "$INSTALL_DIR/package.json"
  cp "$SKILL_DIR/src/signing-proxy.js" "$INSTALL_DIR/src/signing-proxy.js"
else
  echo "       Downloading from GitHub..."
  curl -sSL "$RAW/package.json" -o "$INSTALL_DIR/package.json"
  curl -sSL "$RAW/src/signing-proxy.js" -o "$INSTALL_DIR/src/signing-proxy.js"
fi

# Install npm dependencies
echo "[3/6] Installing npm dependencies (viem, x402-fetch, @x402/fetch, @x402/evm)..."
cd "$INSTALL_DIR"
npm install --production 2>/dev/null || {
  echo "       Retrying with --legacy-peer-deps..."
  npm install --production --legacy-peer-deps 2>/dev/null || true
}

# Install shell tools
echo "[4/6] Installing shell tools..."
TOOLS="wallet-info wallet-balance signed-fetch crypto-send erc8128-sign"
for tool in $TOOLS; do
  if [ -n "$SKILL_DIR" ]; then
    cp "$SKILL_DIR/bin/$tool" "$TOOLS_DIR/$tool"
  else
    curl -sSL "$RAW/bin/$tool" -o "$TOOLS_DIR/$tool"
  fi
  chmod +x "$TOOLS_DIR/$tool"
  ln -sf "$TOOLS_DIR/$tool" "/usr/local/bin/$tool"
done

# Install systemd service
echo "[5/6] Setting up systemd service..."
cat > /etc/systemd/system/clawtrl-signing.service <<EOF
[Unit]
Description=Clawtrl ERC-8128 Signing Proxy
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/clawtrl/signing-proxy
ExecStart=/usr/bin/node /opt/clawtrl/signing-proxy/src/signing-proxy.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable clawtrl-signing 2>/dev/null

# Check for wallet key before starting
echo "[6/6] Starting signing proxy..."
HAS_KEY=false
if [ -n "$AGENT_WALLET_PRIVATE_KEY" ]; then
  HAS_KEY=true
elif grep -q "AGENT_WALLET_PRIVATE_KEY" /opt/openclaw/.env 2>/dev/null; then
  HAS_KEY=true
fi

if [ "$HAS_KEY" = true ]; then
  systemctl restart clawtrl-signing
  sleep 2
  if curl -sf http://127.0.0.1:8128/health &>/dev/null; then
    ADDR=$(curl -sf http://127.0.0.1:8128/identity 2>/dev/null | grep -o '"address":"[^"]*"' | cut -d'"' -f4)
    echo ""
    echo "  ✓ Signing proxy running on 127.0.0.1:8128"
    echo "  ✓ Wallet: $ADDR"
  else
    echo ""
    echo "  ! Proxy installed but failed to start"
    echo "    Check logs: journalctl -u clawtrl-signing -n 20"
  fi
else
  echo ""
  echo "  ! AGENT_WALLET_PRIVATE_KEY not found"
  echo "    Set it in /opt/openclaw/.env then run:"
  echo "    systemctl restart clawtrl-signing"
fi

echo ""
echo "  ══════════════════════════════════════"
echo "  Installed:"
echo "    wallet-info      — wallet address + chain"
echo "    wallet-balance   — ETH/USDC balances"
echo "    signed-fetch     — ERC-8128 + x402 requests"
echo "    crypto-send      — send ETH/USDC on Base"
echo "    erc8128-sign     — sign requests (headers only)"
echo "  ══════════════════════════════════════"
echo "  Source: $REPO"
echo ""

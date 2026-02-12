#!/bin/bash
# Clawtrl Wallet Skill Installer
# Installs the signing proxy, shell tools, and systemd service

set -e

INSTALL_DIR="/opt/clawtrl/signing-proxy"
TOOLS_DIR="/opt/clawtrl/wallet-tools"
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Clawtrl Wallet Skill Installer ==="
echo ""

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required. Install Node.js 20+ first."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "WARNING: Node.js 20+ recommended (found v$NODE_VERSION)"
fi

# Check for AGENT_WALLET_PRIVATE_KEY
if [ -z "$AGENT_WALLET_PRIVATE_KEY" ] && ! grep -q "AGENT_WALLET_PRIVATE_KEY" /opt/openclaw/.env 2>/dev/null; then
  echo ""
  echo "WARNING: AGENT_WALLET_PRIVATE_KEY not found."
  echo "Set it in /opt/openclaw/.env or as an environment variable before starting the proxy."
  echo ""
fi

# Create directories
echo "[1/5] Creating directories..."
sudo mkdir -p "$INSTALL_DIR"
sudo mkdir -p "$TOOLS_DIR"

# Copy signing proxy
echo "[2/5] Installing signing proxy..."
sudo cp "$SKILL_DIR/package.json" "$INSTALL_DIR/package.json"
sudo mkdir -p "$INSTALL_DIR/src"
sudo cp "$SKILL_DIR/src/signing-proxy.js" "$INSTALL_DIR/src/signing-proxy.js"

# Install npm dependencies
echo "[3/5] Installing dependencies..."
cd "$INSTALL_DIR"
sudo npm install --production 2>/dev/null || {
  echo "WARNING: npm install had issues, retrying..."
  sudo npm install --production --legacy-peer-deps 2>/dev/null || true
}

# Copy shell tools
echo "[4/5] Installing shell tools..."
for tool in wallet-info wallet-balance signed-fetch crypto-send erc8128-sign; do
  sudo cp "$SKILL_DIR/bin/$tool" "$TOOLS_DIR/$tool"
  sudo chmod +x "$TOOLS_DIR/$tool"
  sudo ln -sf "$TOOLS_DIR/$tool" "/usr/local/bin/$tool"
done

# Install systemd service
echo "[5/5] Setting up systemd service..."
sudo tee /etc/systemd/system/clawtrl-signing.service > /dev/null <<EOF
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

sudo systemctl daemon-reload
sudo systemctl enable clawtrl-signing
sudo systemctl restart clawtrl-signing

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Signing proxy:  127.0.0.1:8128"
echo "Tools installed: wallet-info, wallet-balance, signed-fetch, crypto-send, erc8128-sign"
echo ""

# Check if proxy started
sleep 2
if curl -sf http://127.0.0.1:8128/health &>/dev/null; then
  ADDR=$(curl -sf http://127.0.0.1:8128/identity | grep -o '"address":"[^"]*"' | cut -d'"' -f4)
  echo "Status: RUNNING"
  echo "Wallet: $ADDR"
else
  echo "Status: NOT RUNNING (check: journalctl -u clawtrl-signing -n 20)"
  echo "Make sure AGENT_WALLET_PRIVATE_KEY is set in /opt/openclaw/.env"
fi

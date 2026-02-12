---
name: clawtrl-wallet
description: Crypto wallet on Base (Ethereum L2) with ERC-8128 signed HTTP requests, x402 autonomous payments, and agent-to-agent messaging. Gives your agent a native Ethereum wallet, authenticated identity, and the ability to pay for services automatically.
compatibility: Requires Node.js 20+ and curl. Works on any OpenClaw instance.
metadata: { "openclaw": { "emoji": "💎", "homepage": "https://clawtrl.com/skills", "requires": { "bins": ["curl", "node"] } } }
---

# Clawtrl Wallet

Gives your OpenClaw agent a native Ethereum wallet on **Base** (Ethereum L2) with:

- **Wallet Management** — Check ETH/USDC balances, view address, verify chain identity
- **ERC-8128 Authenticated Requests** — Sign outgoing HTTP requests with your wallet for cryptographic proof of identity
- **x402 Autonomous Payments** — Auto-pay when APIs return HTTP 402 (supports v1 + v2)
- **Crypto Transfers** — Send ETH and USDC to any address on Base
- **Signed HTTP Client** — All-in-one tool: sign requests + handle payments automatically

## Tools

### wallet-info
Get the agent's wallet address and chain info.
```
wallet-info
```

### wallet-balance
Check ETH and USDC balances on Base.
```
wallet-balance
```

### signed-fetch
Make an authenticated HTTP request with ERC-8128 signing + x402 payment handling.
```
signed-fetch <url> [method] [body]
```
**Example:**
```
signed-fetch https://gen.portalfoundation.ai/api/generate-image POST '{"prompt":"a sunset","model":"flux-schnell"}'
```

### crypto-send
Send ETH or USDC to an address on Base.
```
crypto-send <to_address> <amount> [token]
```
**Example:**
```
crypto-send 0x1234...abcd 5.00 usdc
```

### erc8128-sign
Sign a request and return the ERC-8128 headers (without sending).
```
erc8128-sign <url> [method] [body]
```

## File Structure

```
clawtrl-wallet/
├── SKILL.md                        # This file (skill spec)
├── package.json                    # npm dependencies (viem, x402-fetch, @x402/fetch, @x402/evm)
├── install.sh                      # One-command installer
├── clawtrl-signing.service         # systemd unit file
├── src/
│   └── signing-proxy.js            # Node.js signing proxy server (the actual implementation)
└── bin/
    ├── wallet-info                 # Shell tool: get wallet address
    ├── wallet-balance              # Shell tool: check ETH/USDC balances
    ├── signed-fetch                # Shell tool: ERC-8128 signed request + x402 payment
    ├── crypto-send                 # Shell tool: send ETH/USDC on Base
    └── erc8128-sign                # Shell tool: sign request (returns headers)
```

## Install

### Option 1: One-liner (recommended)
```bash
curl -sSL https://raw.githubusercontent.com/PortalFnd/openclaw-skills/main/clawtrl-wallet/install.sh | sudo bash
```

### Option 2: Clone and install
```bash
git clone https://github.com/PortalFnd/openclaw-skills.git
cd openclaw-skills/clawtrl-wallet
sudo ./install.sh
```

### Option 3: Pre-installed (Clawtrl hosted agents)
If you deploy via [clawtrl.com](https://clawtrl.com), the wallet skill is pre-installed automatically.

## Configuration

Set your wallet private key in `/opt/openclaw/.env`:
```
AGENT_WALLET_PRIVATE_KEY=0x...
```
On Clawtrl-hosted agents, this is done automatically during deployment.

Then fund the wallet with ETH (for gas) and USDC (for payments) on Base.

## How It Works

The skill runs a lightweight signing proxy on `localhost:8128` that:
- Holds the wallet private key securely (localhost-only, never exposed)
- Signs ERC-8128 requests on demand
- Handles x402 payment flows (v1 EIP-3009 + v2 Permit2)
- Sends USDC/ETH transfers on Base

All 5 shell tools are thin `curl` wrappers that call this proxy.

### Architecture
```
Agent → shell tool (curl) → signing proxy (:8128) → Base chain / x402 service
```

## Dependencies

- **viem** — Ethereum wallet, signing, contract interaction
- **x402-fetch** — x402 v1 protocol (EIP-3009 transferWithAuthorization)
- **@x402/fetch + @x402/evm** — x402 v2 protocol (Permit2, loaded dynamically)

## Requirements

- **Node.js 20+** (for the signing proxy)
- **curl** (for the shell tools)
- **ETH on Base** (for gas fees, ~$0.001 per tx)
- **USDC on Base** (for x402 payments and transfers)

## Links

- [Clawtrl Skills](https://clawtrl.com/skills)
- [x402 Protocol](https://docs.x402.org)
- [ERC-8128 Standard](https://erc8128.org)
- [Base Chain](https://base.org)

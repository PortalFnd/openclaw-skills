# clawtrl-wallet

Crypto wallet for AI agents on Base (Ethereum L2). ERC-8128 signing, x402 autonomous payments, ETH/USDC transfers.

## Install

```bash
npx clawtrl-wallet
```

Works with or without root:
- **With root/sudo**: Installs to `/opt/clawtrl/`, sets up systemd service
- **Without root**: Installs to `~/.clawtrl/`, runs proxy as background process

## What's Included

| Tool | Description |
|------|-------------|
| `wallet-info` | Get wallet address and chain identity |
| `wallet-balance` | Check ETH/USDC balances on Base |
| `signed-fetch` | ERC-8128 signed HTTP requests + x402 auto-payment |
| `crypto-send` | Send ETH or USDC to any address on Base |
| `erc8128-sign` | Sign an HTTP request and return headers |

## Requirements

- Node.js 18+
- `AGENT_WALLET_PRIVATE_KEY` environment variable (Ethereum private key)

## Architecture

```
Agent → shell tool (curl) → signing proxy (:8128) → Base chain
                                    |
                              ERC-8128 signing
                              x402 payments (v1 + v2)
                              USDC/ETH transfers
```

## Links

- [Source Code](https://github.com/PortalFnd/openclaw-skills)
- [Clawtrl](https://clawtrl.com)
- [ERC-8128](https://erc8128.org)
- [x402 Protocol](https://docs.x402.org)

## License

MIT

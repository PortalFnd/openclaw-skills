# Clawtrl OpenClaw Skills

Official skills for [OpenClaw](https://openclaw.ai) agents, built by [Clawtrl](https://clawtrl.com).

## Skills

| Skill | Description | Install |
|-------|-------------|---------|
| [clawtrl-wallet](./clawtrl-wallet/) | Crypto wallet on Base with ERC-8128 signing, x402 payments, and transfers | `clawhub install clawtrl-wallet` |

## Install

Send the install command to your agent via Telegram, Discord, or any chat platform:

```
clawhub install clawtrl-wallet
```

Or run it directly in your agent's terminal.

## What's Included

The **clawtrl-wallet** skill gives your agent:

- **Native Ethereum wallet** on Base (L2) with ETH and USDC support
- **ERC-8128 authenticated requests** — cryptographic identity for every HTTP request
- **x402 autonomous payments** — auto-pay APIs that return 402 Payment Required (v1 + v2)
- **Crypto transfers** — send ETH/USDC to any address
- **Signed HTTP client** — signing + payments in one seamless tool

### Tools

| Tool | Description |
|------|-------------|
| `wallet-info` | Get wallet address and chain info |
| `wallet-balance` | Check ETH/USDC balances on Base |
| `signed-fetch` | Authenticated HTTP request with auto-payment |
| `crypto-send` | Send ETH or USDC on Base |
| `erc8128-sign` | Sign a request (returns headers) |

## Pre-installed on Clawtrl

If you deploy an agent via [clawtrl.com](https://clawtrl.com), the wallet skill is pre-installed and configured automatically. Just fund the wallet and go.

## Links

- [Clawtrl Skills Marketplace](https://clawtrl.com/skills)
- [OpenClaw](https://openclaw.ai)
- [Agent Skills Spec](https://skills.sh)
- [x402 Protocol](https://docs.x402.org)
- [ERC-8128](https://erc8128.org)

## License

MIT

<div align="center">

# 🛡️ approvalscan

**Find every token & NFT approval your wallet still has live — and which ones to revoke.**

[![CI](https://github.com/DaddyUnikii/approvalscan/actions/workflows/ci.yml/badge.svg)](https://github.com/DaddyUnikii/approvalscan/actions/workflows/ci.yml)
![node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![deps](https://img.shields.io/badge/dependencies-0-brightgreen)
![chains](https://img.shields.io/badge/chains-BSC%20·%20ETH%20·%20Base%20·%20Arb%20·%20OP%20·%20Polygon-blue)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

Every mint, swap and listing leaves an approval behind. Most are harmless, but an **unlimited** allowance or a
`setApprovalForAll` to the wrong contract is how wallets get drained. `approvalscan` reads your approval history,
**re-checks each one on-chain right now**, and ranks what is still live by risk.

```text
# example output
approvalscan · bsc · 0x5f37…2b9e
source: rpc (last 3d) · 14 events read

RISK    TOKEN           ALLOWANCE           SPENDER                       AGE
HIGH    USDT            Unlimited           0x0000…dead                    3d
        ↳ unlimited allowance, unknown spender, spender is a wallet, not a contract
MEDIUM  VULPES          ALL NFTs            0x9a1c…77e0                    1d
        ↳ can move every NFT in the collection, unknown spender
MEDIUM  USDT            Unlimited           PancakeSwap V2 Router          3d
        ↳ unlimited allowance
LOW     VULPES          NFT #887            OpenSea Conduit             today

1 high · 2 medium · 1 low
Revoke in one place: https://revoke.cash/address/0x5f37…?chainId=56
```

## Install

```bash
git clone https://github.com/DaddyUnikii/approvalscan && cd approvalscan
node bin/approvalscan.js <your-address>          # no npm install, zero dependencies
npm link                                         # optional: get the `approvalscan` command
```

## Usage

```bash
approvalscan 0xYourWallet                        # BNB Chain, last 3 days
approvalscan 0xYourWallet -c eth,base,arb        # several chains (full history via Blockscout)
approvalscan 0xYourWallet -c all --json          # everything, machine-readable
approvalscan 0xYourWallet --calldata             # print revoke calldata for each approval
approvalscan 0xYourWallet --fail-on high         # exit 2 if anything is HIGH (CI / cron)
ETHERSCAN_API_KEY=xxx approvalscan 0xYourWallet  # full history on every chain
```

## Run it from your phone (GitHub Actions)

No laptop needed. Fork or use this repo → **Actions** → **Scan wallet** → **Run workflow**, paste your address and pick chains.
The risk table shows up in the run's **Summary** page. Add an `ETHERSCAN_API_KEY` repo secret for full history on every chain.

## How it works

1. **History** — pulls `Approval` and `ApprovalForAll` events where you are the owner. Best source first:
   Etherscan v2 (if `ETHERSCAN_API_KEY` is set) → Blockscout's keyless API → chunked `eth_getLogs` over the last `--days`,
   shrinking the block range automatically when a public RPC complains.
2. **Collapse** — keeps only the latest event per token + spender (or per NFT id), so revoked ones disappear.
3. **Verify** — calls `allowance`, `isApprovedForAll` and `getApproved` on-chain. Only what is live **now** is reported.
4. **Score** — ranks each approval:

| Signal | Points |
|---|---|
| Spender is a wallet (EOA), not a contract | +3 |
| Unlimited ERC-20 allowance | +2 |
| `setApprovalForAll` (every NFT in the collection) | +2 |
| Spender not in the known-protocol list (Permit2, Seaport, PancakeSwap, Uniswap, 1inch…) | +1 |
| Older than 6 months | +1 |
| You no longer hold the token | −1 |

`HIGH` ≥ 4 · `MEDIUM` 2–3 · `LOW` ≤ 1

## Safety

- **Read-only.** It never asks for a private key or seed phrase and never signs or sends anything.
- `--calldata` only prints the `approve(spender, 0)` / `setApprovalForAll(op, false)` data so you can revoke with your own wallet.
- A low score is not a guarantee. When in doubt, revoke.

## Development

```bash
npm test     # node:test with a fake chain, no network needed
```

MIT © [Unikii](https://github.com/DaddyUnikii)

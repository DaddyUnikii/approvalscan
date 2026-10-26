# Changelog

## 0.1.0 — 2026-10-26

- First release: scan live ERC-20 allowances, ERC-721 single approvals and `setApprovalForAll` on BSC, Ethereum, Base, Arbitrum, Optimism and Polygon.
- History from Etherscan v2 (with key), Blockscout (keyless) or chunked `eth_getLogs` with automatic range shrinking.
- On-chain re-check of every approval, risk scoring (HIGH / MEDIUM / LOW) with reasons, known-protocol labels.
- Output as terminal table, `--json`, `--markdown`; `--calldata` revoke helper; `--fail-on` for CI.
- "Scan wallet" GitHub Actions workflow to run it from a phone.

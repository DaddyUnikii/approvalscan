#!/usr/bin/env node
import { resolveChain, CHAINS } from '../src/chains.js';
import { makeRpc } from '../src/rpc.js';
import { scan } from '../src/scan.js';
import { isAddress } from '../src/hex.js';
import { renderReport, toJSON, toMarkdown } from '../src/format.js';

const HELP = `approvalscan — find every token & NFT approval your wallet still has live, and which ones to revoke.

Usage
  approvalscan <address> [options]

Options
  -c, --chain <list>   chains to scan, comma separated (default: bsc)
                       ${Object.keys(CHAINS).join(', ')}, or "all"
  -d, --days <n>       how far back to read when only RPC is available (default: 3)
      --rpc <url>      use your own RPC (single chain only)
      --calldata       print the revoke calldata for each approval
      --fail-on <lvl>  exit 2 if any approval is at/above high|medium (for CI)
      --json           machine-readable output
      --markdown       markdown table (great for GitHub job summaries)
  -h, --help           show this help

Read-only: approvalscan never asks for a key and never signs anything.
Set ETHERSCAN_API_KEY for full history on every chain (free key, etherscan.io).`;

function parse(argv) {
  const o = { chain: 'bsc', days: 3 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-c' || a === '--chain') o.chain = next();
    else if (a === '-d' || a === '--days') o.days = Number(next());
    else if (a === '--rpc') o.rpc = next();
    else if (a === '--calldata') o.calldata = true;
    else if (a === '--fail-on') o.failOn = next().toUpperCase();
    else if (a === '--json') o.json = true;
    else if (a === '--markdown' || a === '--md') o.md = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  o.address = pos[0];
  return o;
}

async function main() {
  let o;
  try { o = parse(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  if (o.help || !o.address) { console.log(HELP); process.exit(o.help ? 0 : 1); }
  if (!isAddress(o.address)) { console.error('not an EVM address: ' + o.address); process.exit(1); }
  if (!(o.days > 0)) { console.error('--days must be a positive number'); process.exit(1); }
  const keys = o.chain === 'all' ? Object.keys(CHAINS) : o.chain.split(',');
  if (o.rpc && keys.length > 1) { console.error('--rpc works with a single chain'); process.exit(1); }
  const owner = o.address.toLowerCase();
  const reports = [];
  let worst = 3;
  for (const k of keys) {
    let chain;
    try { chain = resolveChain(k.trim()); } catch (e) { console.error(e.message); process.exit(1); }
    const rpc = makeRpc(o.rpc ? [o.rpc] : chain.rpc);
    try {
      const r = await scan({ chain, owner, rpc, days: o.days, apiKey: process.env.ETHERSCAN_API_KEY,
        onProgress: o.json || o.md || !process.stderr.isTTY ? undefined : (p) => process.stderr.write(`\r  scanning ${chain.key} ${Math.round(p * 100)}%`) });
      if (!o.json && process.stderr.isTTY) process.stderr.write('\r\x1b[K');
      reports.push(r);
      for (const a of r.approvals) worst = Math.min(worst, { HIGH: 0, MEDIUM: 1, LOW: 2 }[a.level]);
      if (o.md) console.log(toMarkdown(r) + '\n');
      else if (!o.json) console.log(renderReport(r, { showCalldata: o.calldata }) + '\n');
    } catch (e) {
      reports.push({ chain: chain.key, error: e.message });
      const msg = `${chain.key}: scan failed (${e.message}). Try --rpc <your url> or a smaller --days.`;
      if (!o.json) console.error(msg + '\n');
    }
  }
  if (o.json) console.log(toJSON(reports.length === 1 ? reports[0] : reports));
  if (reports.every((r) => r.error) || !reports.length) process.exit(1);
  const gate = { HIGH: 0, MEDIUM: 1 }[o.failOn];
  if (gate !== undefined && worst <= gate) process.exit(2);
}

main();

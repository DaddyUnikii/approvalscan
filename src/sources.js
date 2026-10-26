// Where approval events come from. Best history first:
//   1. Etherscan v2 (any chain, full history) when ETHERSCAN_API_KEY is set
//   2. Blockscout's keyless etherscan-compatible API (full history) where the chain has one
//   3. Plain eth_getLogs over the last N days, chunked to fit public RPC limits
import { pad32 } from './hex.js';

export const TOPIC_APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
export const TOPIC_APPROVAL_FOR_ALL = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31';

async function explorerLogs(base, params, fetchImpl, label) {
  const out = [];
  let from = 0;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ module: 'logs', action: 'getLogs', fromBlock: String(from), toBlock: 'latest', ...params });
    const url = `${base}${base.includes('?') ? '&' : '?'}${q}`;
    let res, text;
    for (let attempt = 0; ; attempt++) {
      res = await fetchImpl(url);
      text = await res.text();
      if ((res.status !== 429 && !/rate limit|too many/i.test(text)) || attempt >= 3) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`${label} returned non-JSON (HTTP ${res.status})`); }
    const rows = Array.isArray(body.result) ? body.result : [];
    if (!Array.isArray(body.result) && !/no records/i.test(body.message || '')) throw new Error(`${label}: ${body.result || body.message}`);
    out.push(...rows);
    if (rows.length < 1000) break;
    from = parseInt(rows[rows.length - 1].blockNumber, 16); // continue from the last block; duplicates are removed later
  }
  return out;
}

export async function fetchApprovalLogs({ chain, owner, rpc, days = 3, fetchImpl = globalThis.fetch, apiKey, onProgress = () => {} }) {
  const ownerTopic = '0x' + pad32(owner);
  const tries = [];
  if (apiKey) tries.push(['etherscan', `https://api.etherscan.io/v2/api?chainid=${chain.id}&apikey=${apiKey}`]);
  if (chain.blockscout) tries.push(['blockscout', chain.blockscout]);
  const errors = [];
  for (const [label, base] of tries) {
    try {
      const logs = [];
      for (const t0 of [TOPIC_APPROVAL, TOPIC_APPROVAL_FOR_ALL]) {
        logs.push(...(await explorerLogs(base, { topic0: t0, topic1: ownerTopic, topic0_1_opr: 'and' }, fetchImpl, label)));
      }
      return { logs: dedupe(logs), source: label, full: true };
    } catch (e) { errors.push(e.message); }
  }
  const logs = await rpcLogs({ chain, ownerTopic, rpc, days, onProgress });
  return { logs: dedupe(logs), source: `rpc (last ${days}d)`, full: false, errors };
}

async function rpcLogs({ chain, ownerTopic, rpc, days, onProgress }) {
  const latest = parseInt(await rpc.call('eth_blockNumber', []), 16);
  const span = Math.ceil((days * 86400) / chain.blockTime);
  const start = Math.max(0, latest - span);
  let step = 5000;
  const logs = [];
  let from = start;
  while (from <= latest) {
    const to = Math.min(latest, from + step - 1);
    try {
      const got = await rpc.call('eth_getLogs', [{
        fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16),
        topics: [[TOPIC_APPROVAL, TOPIC_APPROVAL_FOR_ALL], ownerTopic],
      }]);
      logs.push(...got);
      from = to + 1;
      onProgress((from - start) / (latest - start + 1));
    } catch (e) {
      if (step > 250) { step = Math.floor(step / 2); continue; } // public RPCs cap ranges differently; shrink and retry
      throw e;
    }
  }
  return logs;
}

function dedupe(logs) {
  const seen = new Set();
  return logs.filter((l) => {
    const k = `${l.transactionHash}:${parseInt(l.logIndex, 16)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

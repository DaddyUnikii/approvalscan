import test from 'node:test';
import assert from 'node:assert/strict';
import { collapse, verify, scan, revokeCalldata } from '../src/scan.js';
import { assess, knownSpender } from '../src/risk.js';
import { decodeString, encodeCall, formatUnits, MAX_UINT, pad32, isAddress } from '../src/hex.js';
import { TOPIC_APPROVAL, TOPIC_APPROVAL_FOR_ALL } from '../src/sources.js';
import { renderReport, describeAmount, age } from '../src/format.js';
import { resolveChain } from '../src/chains.js';

const OWNER = '0x5f37b2286c06cd6956ee9558d0ee3ec79f3f2b9e';
const USDT = '0x55d398326f99059ff775485246999027b3197955';
const NFT = '0x9134ae94ab0739cf0e0f4f5e9cacfa5e1d029b0c';
const PANCAKE = '0x10ed43c718714eb63d5aa57b78b54704e256024e';
const DRAINER = '0x000000000000000000000000000000000000dead';
const MARKET = '0x1111111111111111111111111111111111111111';
const t = (a) => '0x' + pad32(a);
const u = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const log = (address, topics, data, block, idx = 0) => ({
  address, topics, data, blockNumber: '0x' + block.toString(16), logIndex: '0x' + idx.toString(16), transactionHash: '0x' + block.toString(16).padStart(64, 'a'),
});

const LOGS = [
  log(USDT, [TOPIC_APPROVAL, t(OWNER), t(PANCAKE)], u(MAX_UINT), 100),
  log(USDT, [TOPIC_APPROVAL, t(OWNER), t(DRAINER)], u(5n * 10n ** 18n), 101),
  log(USDT, [TOPIC_APPROVAL, t(OWNER), t(DRAINER)], u(MAX_UINT), 102), // later event wins
  log(NFT, [TOPIC_APPROVAL_FOR_ALL, t(OWNER), t(MARKET)], u(1), 103),
  log(NFT, [TOPIC_APPROVAL, t(OWNER), t(MARKET), u(887)], '0x', 104),
  log(NFT, [TOPIC_APPROVAL_FOR_ALL, t(OWNER), t(DRAINER)], u(1), 105),
  log(NFT, [TOPIC_APPROVAL_FOR_ALL, t(OWNER), t(DRAINER)], u(0), 106), // revoked
];

// A fake chain: answers eth_call like the real contracts would.
function fakeRpc() {
  const state = {
    allowance: { [PANCAKE]: MAX_UINT, [DRAINER]: MAX_UINT },
    forAll: { [MARKET]: true },
    approved: { 887: MARKET },
  };
  const str = (s) => '0x' + u(32).slice(2) + u(s.length).slice(2) + Buffer.from(s).toString('hex').padEnd(64, '0');
  return {
    calls: 0,
    async call(method, params) {
      this.calls++;
      if (method === 'eth_blockNumber') return '0x' + (200).toString(16);
      if (method === 'eth_getLogs') return LOGS;
      if (method === 'eth_getBlockByNumber') return { timestamp: '0x' + Math.floor(Date.now() / 1000 - 86400 * 3).toString(16) };
      if (method === 'eth_getCode') return params[0] === DRAINER ? '0x' : '0x6080';
      const { to, data } = params[0];
      const sel = data.slice(0, 10);
      const a1 = '0x' + data.slice(34, 74), a2 = '0x' + data.slice(98, 138);
      if (sel === '0x95d89b41') return str(to === USDT ? 'USDT' : 'VULPES');
      if (sel === '0x06fdde03') return str(to === USDT ? 'Tether USD' : 'PixelVulpes');
      if (sel === '0x313ce567') return to === USDT ? u(18) : '0x';
      if (sel === '0x70a08231') return u(to === USDT ? 0 : 1);
      if (sel === '0xdd62ed3e') { assert.equal(a1, OWNER); return u(state.allowance[a2] || 0n); }
      if (sel === '0xe985e9c5') return u(state.forAll[a2] ? 1 : 0);
      if (sel === '0x081812fc') return t(state.approved[Number(BigInt('0x' + data.slice(10)))] || '0x' + '0'.repeat(40));
      throw new Error('unexpected call ' + sel);
    },
  };
}

test('collapse keeps only the latest live event per pair', () => {
  const c = collapse(LOGS);
  assert.equal(c.length, 4); // pancake, drainer (erc20), market forAll, nft #887 — drainer forAll was revoked
  const drainer = c.find((x) => x.kind === 'erc20' && x.spender === DRAINER);
  assert.equal(drainer.amount, MAX_UINT);
  assert.ok(c.find((x) => x.kind === 'nft' && x.tokenId === 887n));
  assert.ok(!c.find((x) => x.kind === 'all' && x.spender === DRAINER));
});

test('verify re-reads state and drops what is no longer live', async () => {
  const extra = collapse([...LOGS, log(USDT, [TOPIC_APPROVAL, t(OWNER), t(MARKET)], u(7), 107)]);
  const live = await verify(extra, { rpc: fakeRpc(), owner: OWNER, chainId: 56 });
  assert.equal(live.length, 4); // the MARKET erc20 allowance reads 0 on-chain now
  const p = live.find((x) => x.spender === PANCAKE);
  assert.equal(p.spenderName, 'PancakeSwap V2 Router');
  assert.equal(p.symbol, 'USDT');
  assert.equal(p.unlimited, true);
  assert.equal(live.find((x) => x.spender === DRAINER).spenderIsEoa, true);
});

test('risk scoring: unlimited to an EOA is HIGH, known router is lower', () => {
  const hi = assess({ kind: 'erc20', unlimited: true, spenderName: null, spenderIsEoa: true });
  const mid = assess({ kind: 'erc20', unlimited: true, spenderName: 'PancakeSwap V2 Router', spenderIsEoa: false });
  const lo = assess({ kind: 'nft', spenderName: 'OpenSea Conduit', spenderIsEoa: false });
  assert.equal(hi.level, 'HIGH');
  assert.equal(mid.level, 'MEDIUM');
  assert.equal(lo.level, 'LOW');
  assert.ok(hi.reasons.includes('spender is a wallet, not a contract'));
});

test('full scan over RPC sorts riskiest first', async () => {
  const chain = resolveChain('bsc');
  const r = await scan({ chain, owner: OWNER, rpc: fakeRpc(), days: 1, fetchImpl: () => { throw new Error('offline'); } });
  assert.equal(r.fullHistory, false);
  assert.equal(r.approvals[0].level, 'HIGH');
  assert.equal(r.approvals[0].spender, DRAINER);
  const out = renderReport(r);
  assert.match(out, /PancakeSwap V2 Router/);
  assert.match(out, /revoke\.cash\/address\/0x5f37.*chainId=56/);
});

test('explorer path is used when available and paginates', async () => {
  const chain = { ...resolveChain('eth'), blockscout: 'https://example.test/api' };
  let hits = 0;
  const fetchImpl = async (url) => {
    hits++;
    const topic0 = new URL(url).searchParams.get('topic0');
    const rows = LOGS.filter((l) => l.topics[0] === topic0).map((l) => ({ ...l, timeStamp: '0x' + (1700000000).toString(16) }));
    return { status: 200, text: async () => JSON.stringify({ status: '1', message: 'OK', result: rows }) };
  };
  const r = await scan({ chain, owner: OWNER, rpc: fakeRpc(), fetchImpl });
  assert.equal(r.source, 'blockscout');
  assert.equal(r.fullHistory, true);
  assert.equal(hits, 2);
  assert.ok(r.approvals.every((a) => a.reasons.includes('older than 6 months')));
});

test('revoke calldata is correct', () => {
  const [a] = collapse(LOGS.slice(0, 1));
  assert.deepEqual(revokeCalldata(a), { to: USDT, data: '0x095ea7b3' + pad32(PANCAKE) + '0'.repeat(64) });
  const all = revokeCalldata({ kind: 'all', token: NFT, spender: MARKET });
  assert.equal(all.data.slice(0, 10), '0xa22cb465');
});

test('helpers', () => {
  assert.equal(decodeString('0x' + u(32).slice(2) + u(4).slice(2) + Buffer.from('USDT').toString('hex').padEnd(64, '0')), 'USDT');
  assert.equal(decodeString('0x' + Buffer.from('MKR').toString('hex').padEnd(64, '0')), 'MKR');
  assert.equal(formatUnits(1234567n * 10n ** 15n, 18), '1,234.567');
  assert.equal(encodeCall('0x70a08231', OWNER), '0x70a08231' + pad32(OWNER));
  assert.equal(describeAmount({ kind: 'erc20', unlimited: true }), 'Unlimited');
  assert.equal(age(Date.now() / 1000 - 86400 * 400), '13mo');
  assert.ok(isAddress(OWNER) && !isAddress('0x123'));
  assert.equal(knownSpender('0x000000000022D473030F116dDEE9F6B43aC78BA3', 8453), 'Uniswap Permit2');
  assert.equal(knownSpender(PANCAKE, 1), null);
  assert.throws(() => resolveChain('solana'));
});

test('markdown report', async () => {
  const r = await scan({ chain: resolveChain('bsc'), owner: OWNER, rpc: fakeRpc(), days: 1 });
  const { toMarkdown } = await import('../src/format.js');
  const md = toMarkdown(r);
  assert.match(md, /\| 🔴 HIGH \| USDT \| Unlimited \|/);
  assert.match(md, /revoke\.cash/);
});

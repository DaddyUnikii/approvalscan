// Known spenders, so a big allowance to Permit2 reads differently from one to a random contract.
// Addresses are lowercase. "*" = same address on every chain.
export const KNOWN = {
  '0x000000000022d473030f116ddee9f6b43ac78ba3': { name: 'Uniswap Permit2', chains: '*' },
  '0x0000000000000068f116a894984e2db1123eb395': { name: 'OpenSea Seaport 1.6', chains: '*' },
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': { name: 'OpenSea Seaport 1.5', chains: '*' },
  '0x1e0049783f008a0085193e00003d00cd54003c71': { name: 'OpenSea Conduit', chains: '*' },
  '0x111111125421ca6dc452d289314280a0f8842a65': { name: '1inch Router v6', chains: '*' },
  '0x1111111254eeb25477b68fb85ed929f73a960582': { name: '1inch Router v5', chains: '*' },
  '0x66a9893cc07d91d95644aedd05d03f95e1dba8af': { name: 'Uniswap Universal Router v4', chains: [1] },
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { name: 'Uniswap Universal Router', chains: [1, 10, 137, 42161, 8453] },
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { name: 'Uniswap V2 Router', chains: [1] },
  '0xe592427a0aece92de3edee1f18e0157c05861564': { name: 'Uniswap V3 Router', chains: [1, 10, 137, 42161] },
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': { name: 'Uniswap SwapRouter02', chains: [1, 10, 137, 42161] },
  '0x10ed43c718714eb63d5aa57b78b54704e256024e': { name: 'PancakeSwap V2 Router', chains: [56] },
  '0x13f4ea83d0bd40e75c8222255bc855a974568dd4': { name: 'PancakeSwap Smart Router', chains: [56, 1, 8453, 42161] },
  '0x1b81d678ffb9c0263b24a97847620c99d213eb14': { name: 'PancakeSwap V3 Router', chains: [56, 1, 8453, 42161] },
  '0x31c2f6fcff4f8759b3bd5bf0e1084a055615c768': { name: 'PancakeSwap Permit2', chains: [56, 1, 8453, 42161] },
};

export function knownSpender(address, chainId) {
  const k = KNOWN[address.toLowerCase()];
  if (!k) return null;
  return k.chains === '*' || k.chains.includes(chainId) ? k.name : null;
}

// Score each live approval. Higher = more worth revoking.
export function assess(a, { now = Date.now() / 1000 } = {}) {
  const reasons = [];
  let score = 0;
  if (a.kind === 'erc20' && a.unlimited) { score += 2; reasons.push('unlimited allowance'); }
  if (a.kind === 'all') { score += 2; reasons.push('can move every NFT in the collection'); }
  if (!a.spenderName) { score += 1; reasons.push('unknown spender'); }
  if (a.spenderIsEoa) { score += 3; reasons.push('spender is a wallet, not a contract'); }
  if (a.timestamp && now - a.timestamp > 180 * 86400) { score += 1; reasons.push('older than 6 months'); }
  if (a.kind === 'erc20' && a.balanceZero) { score -= 1; reasons.push('you hold none of this token now'); }
  const level = score >= 4 ? 'HIGH' : score >= 2 ? 'MEDIUM' : 'LOW';
  return { ...a, score, level, reasons };
}

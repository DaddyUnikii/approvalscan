// Chain registry. Every RPC here is a free public endpoint; pass --rpc to use your own.
export const CHAINS = {
  eth: { id: 1, name: 'Ethereum', native: 'ETH', blockTime: 12,
    rpc: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://cloudflare-eth.com'],
    blockscout: 'https://eth.blockscout.com/api' },
  bsc: { id: 56, name: 'BNB Chain', native: 'BNB', blockTime: 0.75,
    rpc: ['https://bsc-rpc.publicnode.com', 'https://bsc.rpc.blxrbdn.com', 'https://bsc-dataseed.bnbchain.org', 'https://bsc.drpc.org'] },
  base: { id: 8453, name: 'Base', native: 'ETH', blockTime: 2,
    rpc: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'],
    blockscout: 'https://base.blockscout.com/api' },
  arb: { id: 42161, name: 'Arbitrum', native: 'ETH', blockTime: 0.25,
    rpc: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc'],
    blockscout: 'https://arbitrum.blockscout.com/api' },
  op: { id: 10, name: 'Optimism', native: 'ETH', blockTime: 2,
    rpc: ['https://optimism-rpc.publicnode.com', 'https://mainnet.optimism.io'],
    blockscout: 'https://optimism.blockscout.com/api' },
  polygon: { id: 137, name: 'Polygon', native: 'POL', blockTime: 2,
    rpc: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com'],
    blockscout: 'https://polygon.blockscout.com/api' },
};

export const ALIASES = { ethereum: 'eth', mainnet: 'eth', bnb: 'bsc', binance: 'bsc', arbitrum: 'arb', optimism: 'op', matic: 'polygon' };

export function resolveChain(key) {
  const k = String(key).toLowerCase();
  const name = CHAINS[k] ? k : ALIASES[k];
  if (!name) throw new Error(`unknown chain "${key}" (try: ${Object.keys(CHAINS).join(', ')})`);
  return { key: name, ...CHAINS[name] };
}

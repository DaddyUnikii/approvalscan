import { formatUnits } from './hex.js';
import { revokeCalldata } from './scan.js';

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const red = c('31;1'), yellow = c('33'), green = c('32'), dim = c('2'), bold = c('1');
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const levelColor = { HIGH: red, MEDIUM: yellow, LOW: green };

export function describeAmount(a) {
  if (a.kind === 'all') return 'ALL NFTs';
  if (a.kind === 'nft') return `NFT #${a.tokenId}`;
  if (a.unlimited) return 'Unlimited';
  return a.decimals == null ? a.amount.toString() : formatUnits(a.amount, a.decimals);
}

export function age(ts, now = Date.now() / 1000) {
  if (!ts) return '?';
  const d = Math.floor((now - ts) / 86400);
  if (d < 1) return 'today';
  if (d < 60) return `${d}d`;
  if (d < 730) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

export function renderReport(r, { showCalldata = false } = {}) {
  const lines = [];
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const a of r.approvals) counts[a.level]++;
  lines.push(bold(`approvalscan · ${r.chain} · ${short(r.owner)}`));
  lines.push(dim(`source: ${r.source}${r.fullHistory ? '' : '  (older approvals need --days N or ETHERSCAN_API_KEY)'} · ${r.events} events read`));
  lines.push('');
  if (!r.approvals.length) { lines.push(green('✓ No live approvals found. Nothing to revoke.')); return lines.join('\n'); }
  const rows = r.approvals.map((a) => [
    levelColor[a.level](a.level.padEnd(6)),
    (a.symbol || a.tokenName || short(a.token)).slice(0, 14).padEnd(14),
    describeAmount(a).slice(0, 18).padEnd(18),
    (a.spenderName || short(a.spender)).slice(0, 26).padEnd(26),
    age(a.timestamp).padStart(5),
  ].join('  '));
  lines.push(dim(['RISK  ', 'TOKEN'.padEnd(14), 'ALLOWANCE'.padEnd(18), 'SPENDER'.padEnd(26), '  AGE'].join('  ')));
  r.approvals.forEach((a, i) => {
    lines.push(rows[i]);
    if (a.level !== 'LOW') lines.push(dim('        ↳ ' + a.reasons.join(', ')));
    if (showCalldata) { const t = revokeCalldata(a); lines.push(dim(`        revoke: to ${t.to} data ${t.data}`)); }
  });
  lines.push('');
  lines.push(`${red(counts.HIGH + ' high')} · ${yellow(counts.MEDIUM + ' medium')} · ${green(counts.LOW + ' low')}`);
  lines.push(dim(`Revoke in one place: https://revoke.cash/address/${r.owner}?chainId=${r.chainId}`));
  return lines.join('\n');
}

export function toJSON(r) {
  return JSON.stringify(r, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

export function toMarkdown(r) {
  const out = [`### ${r.chain} · \`${r.owner}\``, '', `Source: ${r.source} · ${r.events} events read`, ''];
  if (!r.approvals.length) return out.concat('✅ No live approvals. Nothing to revoke.').join('\n');
  const icon = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' };
  out.push('| Risk | Token | Allowance | Spender | Age | Why |', '|---|---|---|---|---|---|');
  for (const a of r.approvals) {
    out.push(`| ${icon[a.level]} ${a.level} | ${a.symbol || a.tokenName || a.token} | ${describeAmount(a)} | ${a.spenderName || '`' + a.spender + '`'} | ${age(a.timestamp)} | ${a.reasons.join(', ') || '-'} |`);
  }
  out.push('', `[Revoke on revoke.cash](https://revoke.cash/address/${r.owner}?chainId=${r.chainId})`);
  return out.join('\n');
}

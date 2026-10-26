// Tiny JSON-RPC client with endpoint fallback and retry. No dependencies.
export function makeRpc(urls, { fetchImpl = globalThis.fetch, retries = 2, timeoutMs = 15000 } = {}) {
  let preferred = 0;
  let id = 0;
  async function call(method, params) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      for (let k = 0; k < urls.length; k++) {
        const i = (preferred + k) % urls.length;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), timeoutMs);
          const res = await fetchImpl(urls[i], {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: ctrl.signal,
          }).finally(() => clearTimeout(timer));
          const text = await res.text();
          let body;
          try { body = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} from ${urls[i]}`); }
          if (body.error) {
            const e = new Error(body.error.message || 'rpc error');
            e.rpc = true;
            // range errors are the caller's to handle, so surface them straight away
            if (/range|too many|limit|exceed/i.test(e.message) && method === 'eth_getLogs') { e.range = true; throw e; }
            throw e;
          }
          preferred = i;
          return body.result;
        } catch (e) {
          if (e.range) throw e;
          lastErr = e;
        }
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    throw lastErr;
  }
  return { call, urls };
}

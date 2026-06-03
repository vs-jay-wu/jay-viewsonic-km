// Reload WebView and capture the convertMVBToken response (POST returning access_token/id_token).
// Inject the captured OIDC token into desktop localhost picker's sessionStorage as `ocv2_token_info`.

const SRC_PORT = process.env.SRC_PORT || '9222';
const DST_PORT = process.env.DST_PORT || '9224';
const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000/originals/picker/contents';

async function getPages(port) { return (await fetch(`http://localhost:${port}/json`)).json(); }

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const opened = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const listeners = new Set();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    listeners.forEach(fn => fn(m));
  });
  return opened.then(() => ({
    send: (method, params) => new Promise((res, rej) => {
      const myId = ++id;
      const fn = m => { if (m.id === myId) { listeners.delete(fn); m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); } };
      listeners.add(fn);
      ws.send(JSON.stringify({ id: myId, method, params }));
    }),
    on: (evt, cb) => { const fn = m => { if (m.method === evt) cb(m.params); }; listeners.add(fn); return () => listeners.delete(fn); },
    close: () => ws.close(),
  }));
}

// 1. Connect to WebView page
const srcPages = await getPages(SRC_PORT);
const srcPage = srcPages.find(p => p.type === 'page' && p.url.includes('picker'));
console.log('WebView page:', srcPage.url);
const src = await connect(srcPage.webSocketDebuggerUrl);
await src.send('Network.enable', {});
await src.send('Page.enable', {});

// 2. Capture responses; remember any that look like an OIDC token response
const captured = [];
const responseReceived = new Map(); // requestId -> {url, status}
src.on('Network.responseReceived', p => {
  responseReceived.set(p.requestId, { url: p.response.url, status: p.response.status, mimeType: p.response.mimeType });
});
src.on('Network.loadingFinished', async p => {
  const meta = responseReceived.get(p.requestId);
  if (!meta || meta.status !== 200) return;
  if (!/json/i.test(meta.mimeType)) return;
  try {
    const { body, base64Encoded } = await src.send('Network.getResponseBody', { requestId: p.requestId });
    const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
    if (/access_token/.test(text) && /id_token/.test(text)) {
      captured.push({ url: meta.url, body: text });
      console.log('Captured token-shaped response from:', meta.url);
    }
  } catch {}
});

// 3. Reload WebView
console.log('Reloading WebView to force token conversion...');
await src.send('Page.reload', { ignoreCache: true });

// 4. Wait until we capture something (or timeout)
const start = Date.now();
while (captured.length === 0 && Date.now() - start < 20000) {
  await new Promise(r => setTimeout(r, 500));
}

if (captured.length === 0) {
  console.error('FAIL: did not capture any access_token-bearing response within 20s.');
  console.error('Recent responses seen:');
  [...responseReceived.values()].slice(-15).forEach(r => console.error(' ', r.status, r.url));
  process.exit(1);
}

// Prefer the last one captured (the actual OIDC exchange usually fires after discovery)
const tokenResp = captured[captured.length - 1];
console.log('Using OIDC response from:', tokenResp.url);
const parsed = JSON.parse(tokenResp.body);
console.log('Token fields:', Object.keys(parsed).join(', '));

// 5. Push into desktop localhost picker as ocv2_token_info (dev fallback path)
const dstPages = await getPages(DST_PORT);
const dstPage = dstPages.find(p => p.type === 'page' && p.url.startsWith('http://localhost:3000'));
if (!dstPage) { console.error('No localhost tab in Chrome on', DST_PORT); process.exit(1); }
const dst = await connect(dstPage.webSocketDebuggerUrl);
const payload = JSON.stringify(tokenResp.body).replace(/[\\`$]/g, m => '\\' + m);
const r = await dst.send('Runtime.evaluate', {
  expression: `sessionStorage.setItem('ocv2_token_info', ${JSON.stringify(tokenResp.body)}); location.reload(); 'ok'`,
  returnByValue: true,
});
console.log('Injected ocv2_token_info into desktop and reloaded.');
src.close();
dst.close();
process.exit(0);

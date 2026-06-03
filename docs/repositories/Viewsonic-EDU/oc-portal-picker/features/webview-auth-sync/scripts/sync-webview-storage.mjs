// Sync sessionStorage/localStorage from Android WebView to desktop Chrome.
// Usage: node sync-webview-storage.mjs
//   env: SRC_PORT=9222  (WebView CDP), DST_PORT=9224 (desktop Chrome CDP)
//        TARGET_URL=http://localhost:3000/originals/picker/contents
//        SRC_URL_INCLUDES=originals/picker  (filter for source page if multiple)

const SRC_PORT = process.env.SRC_PORT || '9222';
const DST_PORT = process.env.DST_PORT || '9224';
const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000/originals/picker/contents';
const SRC_FILTER = process.env.SRC_URL_INCLUDES || 'originals/picker';

async function getPages(port) {
  const r = await fetch(`http://localhost:${port}/json`);
  return r.json();
}

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const send = (method, params) => new Promise((res, rej) => {
    const myId = ++id;
    const onMsg = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === myId) {
        ws.removeEventListener('message', onMsg);
        if (m.error) rej(new Error(`${method}: ${m.error.message}`));
        else res(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  return {
    send,
    eval: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result?.value;
    },
    close: () => ws.close(),
  };
}

async function openTabAndGetWs(port, url) {
  // Try to find existing tab matching url, else open new
  let pages = await getPages(port);
  let page = pages.find(p => p.type === 'page' && p.url.startsWith(url.split('?')[0]));
  if (!page) {
    await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).catch(() => {});
    // older Chrome accepts GET on /json/new
    await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    pages = await getPages(port);
    page = pages.find(p => p.type === 'page' && p.url.includes(url.split('://')[1].split('/')[0]));
  }
  if (!page) throw new Error(`No matching tab on port ${port} for ${url}`);
  return page;
}

(async () => {
  // 1. Find source WebView page
  const srcPages = await getPages(SRC_PORT);
  const srcPage = srcPages.find(p => p.type === 'page' && p.url.includes(SRC_FILTER));
  if (!srcPage) {
    console.error('Source pages on', SRC_PORT, ':');
    srcPages.forEach(p => console.error('  -', p.url));
    throw new Error(`No source page matching "${SRC_FILTER}"`);
  }
  console.log('SOURCE:', srcPage.url);

  // 2. Dump storage + cookies from WebView
  const src = await cdpConnect(srcPage.webSocketDebuggerUrl);
  await src.send('Network.enable', {});
  const dumpJson = await src.eval(`
    JSON.stringify({
      origin: location.origin,
      url: location.href,
      session: Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])),
      local:   Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))
    })
  `);
  const data = JSON.parse(dumpJson);
  const { cookies: srcCookies } = await src.send('Network.getAllCookies', {});
  src.close();
  console.log('  origin:', data.origin);
  console.log('  sessionStorage keys:', Object.keys(data.session).length);
  console.log('  localStorage   keys:', Object.keys(data.local).length);
  console.log('  cookies (incl. httpOnly):', srcCookies.length);

  // 3. Open / find target tab on desktop Chrome
  const dstPage = await openTabAndGetWs(DST_PORT, TARGET_URL);
  console.log('TARGET:', dstPage.url);
  const dst = await cdpConnect(dstPage.webSocketDebuggerUrl);
  await dst.send('Network.enable', {});

  // 4a. Write sessionStorage + localStorage on target
  const payload = JSON.stringify(data).replace(/[\\`$]/g, m => '\\' + m);
  const writeResult = await dst.eval(`
    (() => {
      const d = JSON.parse(\`${payload}\`);
      for (const [k,v] of Object.entries(d.session)) sessionStorage.setItem(k, v);
      for (const [k,v] of Object.entries(d.local))   localStorage.setItem(k, v);
      return { session: Object.keys(d.session).length, local: Object.keys(d.local).length };
    })()
  `);
  console.log('WROTE storage:', writeResult);

  // 4b. Write cookies on target (kept at original domain so XHR to api.myviewboard.com sends them)
  const params = srcCookies.map(c => {
    const p = {
      name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
    };
    if (c.expires && c.expires > 0) p.expires = c.expires;
    return p;
  });
  const setRes = await dst.send('Network.setCookies', { cookies: params }).catch(e => ({ error: e.message }));
  if (setRes.error) {
    console.log('Bulk setCookies failed, falling back one-by-one:', setRes.error);
    let ok = 0, fail = 0;
    for (const c of params) {
      try { await dst.send('Network.setCookie', c); ok++; } catch (e) { fail++; }
    }
    console.log(`WROTE cookies: ${ok} ok, ${fail} failed`);
  } else {
    console.log(`WROTE cookies: ${params.length}`);
  }

  // 5. Reload target
  await dst.eval(`location.reload(); 'ok'`);
  dst.close();
  console.log('Reloaded target tab.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });

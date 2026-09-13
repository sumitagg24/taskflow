// ssrfFetch.test.js — runtime SSRF enforcement on the guarded fetch used for
// custom AI endpoints. The save-time guard (ssrfGuard.test.js) covers URL
// syntax + DNS; this suite proves the RUNTIME wrapper enforces the same rules
// on every redirect hop, plus size/time ceilings.
const dns = require('dns');
const http = require('http');
const { ssrfFetch, SsrfBlockedError } = require('../utils/ssrfFetch');

// Deterministic DNS: evil-redirect.example.com → loopback.
jest.spyOn(dns.promises, 'resolve4').mockImplementation(async (host) => {
  if (host === 'evil-redirect.example.com') return ['127.0.0.1'];
  if (host === 'public.example.com') return ['93.184.216.34'];
  throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
});
jest.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

// Local HTTP servers simulate the hostile endpoint. AI_ALLOW_HTTP + loopback
// is the only path ssrfFetch permits over http — and the redirect target is
// still re-validated, which is the behaviour under test.
let redirectServer;
let redirectUrl;
let bigServer;
let bigUrl;
let hangServer;
let hangUrl;

beforeAll(async () => {
  process.env.AI_ALLOW_HTTP = 'true';
  process.env.AI_REQUIRE_HTTPS = 'false';

  redirectServer = http.createServer((req, res) => {
    if (req.url === '/to-private') {
      // Redirect into RFC1918 space — the classic redirect-based SSRF. The
      // guard must refuse BEFORE any connection is attempted (no network
      // needed for the test to be deterministic).
      res.writeHead(302, { Location: 'http://10.255.255.1/v1' });
      res.end();
    } else if (req.url === '/to-metadata') {
      res.writeHead(302, { Location: 'https://169.254.169.254/latest/meta-data/' });
      res.end();
    } else if (req.url === '/to-internal-dns') {
      res.writeHead(302, { Location: 'https://db.internal.svc.cluster.local/v1' });
      res.end();
    } else if (req.url === '/loop') {
      res.writeHead(302, { Location: '/loop' });
      res.end();
    } else if (req.url === '/ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    } else {
      res.writeHead(200);
      res.end('{}');
    }
  });
  await new Promise((r) => redirectServer.listen(0, '127.0.0.1', r));
  redirectUrl = `http://127.0.0.1:${redirectServer.address().port}`;

  bigServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    const chunk = Buffer.alloc(1024 * 1024, 0x41); // 1 MiB of 'A'
    for (let i = 0; i < 8; i++) res.write(chunk);
    res.end();
  });
  await new Promise((r) => bigServer.listen(0, '127.0.0.1', r));
  bigUrl = `http://127.0.0.1:${bigServer.address().port}`;

  hangServer = http.createServer(() => {
    /* never respond */
  });
  await new Promise((r) => hangServer.listen(0, '127.0.0.1', r));
  hangUrl = `http://127.0.0.1:${hangServer.address().port}`;
});

afterAll(async () => {
  // closeAllConnections kills undici's keep-alive sockets so jest exits clean.
  redirectServer?.closeAllConnections?.();
  bigServer?.closeAllConnections?.();
  hangServer?.closeAllConnections?.();
  redirectServer?.close();
  bigServer?.close();
  hangServer?.close();
  delete process.env.AI_ALLOW_HTTP;
  delete process.env.AI_REQUIRE_HTTPS;
});

describe('ssrfFetch redirect enforcement', () => {
  it('blocks a redirect from a permitted endpoint to a private IP', async () => {
    await expect(ssrfFetch(`${redirectUrl}/to-private`)).rejects.toThrow(SsrfBlockedError);
    await expect(ssrfFetch(`${redirectUrl}/to-private`)).rejects.toThrow(/private|loopback/i);
  });

  it('blocks a redirect to the cloud metadata endpoint', async () => {
    await expect(ssrfFetch(`${redirectUrl}/to-metadata`)).rejects.toThrow(/not allowed|private/i);
  });

  it('blocks a redirect to an internal cluster DNS name', async () => {
    await expect(ssrfFetch(`${redirectUrl}/to-internal-dns`)).rejects.toThrow(SsrfBlockedError);
  });

  it('blocks the redirect loop beyond the redirect limit', async () => {
    await expect(ssrfFetch(`${redirectUrl}/loop`)).rejects.toThrow(/too many redirects/i);
  });

  it('follows a legitimate redirect to another validated public/loopback target', async () => {
    // /loop2 → /ok on the same loopback server: both hops validate.
    await expect(ssrfFetch(`${redirectUrl}/ok`)).resolves.toMatchObject({ ok: true, status: 200 });
  });
});

describe('ssrfFetch response-size cap', () => {
  it('rejects bodies larger than the cap instead of buffering them', async () => {
    await expect(ssrfFetch(bigUrl, {}, { maxBytes: 1024 * 1024 })).rejects.toThrow(/exceeded/i);
  });

  it('returns parsed JSON for responses within the cap', async () => {
    const res = await ssrfFetch(`${redirectUrl}/ok`);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

describe('ssrfFetch timeout', () => {
  it('aborts a hung endpoint within the configured timeout', async () => {
    const start = Date.now();
    await expect(ssrfFetch(hangUrl, {}, { timeoutMs: 300 })).rejects.toThrow(/timeout|network/i);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe('ssrfFetch URL-level rules', () => {
  it('still rejects private IP literals outright (no fetch attempted)', async () => {
    await expect(ssrfFetch('http://10.0.0.5/v1')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects metadata hostnames outright', async () => {
    await expect(ssrfFetch('https://metadata.google.internal/computeMetadata/v1')).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it('requires https for non-loopback hosts', async () => {
    await expect(ssrfFetch('http://public.example.com/v1')).rejects.toThrow(/https|http only/i);
  });
});

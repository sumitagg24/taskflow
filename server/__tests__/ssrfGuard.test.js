// ssrfGuard.test.js — Phase 4: user-supplied outbound URLs must never reach
// internal networks. DNS is mocked so tests are deterministic and offline.
const dns = require('dns');

const guard = require('../utils/ssrfGuard');

afterEach(() => jest.restoreAllMocks());

describe('parseAndCheckSyntax', () => {
  const check = (raw, opts) => guard.parseAndCheckSyntax(raw, opts);

  it('accepts a well-formed https URL', () => {
    expect(check('https://api.openai.com/v1').ok).toBe(true);
  });

  it('rejects malformed URLs', () => {
    expect(check('not a url').ok).toBe(false);
    expect(check('').ok).toBe(false);
    expect(check(null).ok).toBe(false);
  });

  it('rejects URLs longer than the maximum', () => {
    const long = `https://api.openai.com/${'a'.repeat(guard.MAX_URL_LENGTH)}`;
    expect(check(long).ok).toBe(false);
  });

  it('rejects embedded credentials', () => {
    expect(check('https://user:pass@api.openai.com/v1').ok).toBe(false);
  });

  it('rejects plain http for remote hosts', () => {
    expect(check('http://api.openai.com/v1').ok).toBe(false);
  });

  it('allows http only for loopback names', () => {
    expect(check('http://localhost:11434/v1', { allowHttpLoopback: true }).ok).toBe(true);
    expect(check('http://127.0.0.1:11434/v1', { allowHttpLoopback: true }).ok).toBe(true);
  });

  it('rejects private-range IP literals', () => {
    expect(check('https://10.0.0.5/v1').ok).toBe(false);
    expect(check('https://192.168.1.10/v1').ok).toBe(false);
    expect(check('https://172.16.0.9/v1').ok).toBe(false);
    expect(check('https://169.254.169.254/latest/meta-data').ok).toBe(false);
    expect(check('https://[::1]/v1').ok).toBe(false);
    expect(check('https://[fe80::1]/v1').ok).toBe(false);
  });

  it('rejects metadata and internal hostnames', () => {
    expect(check('https://metadata.google.internal/computeMetadata/v1').ok).toBe(false);
    expect(check('https://169.254.169.254/latest/meta-data').ok).toBe(false);
    expect(check('https://db.internal.svc.cluster.local').ok).toBe(false);
  });

  it('rejects obfuscated decimal/hex IP hostnames', () => {
    // 2130706433 == 127.0.0.1
    expect(check('https://2130706433/v1').ok).toBe(false);
    expect(check('https://0x7f000001/v1').ok).toBe(false);
  });
});

describe('isBlockedIp', () => {
  it('blocks every required IPv4 range', () => {
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255',
      '192.168.0.1', '169.254.169.254', '224.0.0.1', '0.0.0.0',
    ]) {
      expect(guard.isBlockedIp(ip)).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    expect(guard.isBlockedIp('104.18.6.148')).toBe(false);
    expect(guard.isBlockedIp('8.8.8.8')).toBe(false);
  });

  it('blocks loopback/link-local/ULA/multicast IPv6', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1']) {
      expect(guard.isBlockedIp(ip)).toBe(true);
    }
  });

  it('blocks IPv4-mapped private addresses', () => {
    expect(guard.isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(guard.isBlockedIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('allows public IPv6', () => {
    expect(guard.isBlockedIp('2606:4700::6812:694')).toBe(false);
  });

  it('fails closed on garbage', () => {
    expect(guard.isBlockedIp('not-an-ip')).toBe(true);
  });
});

describe('validateOutboundUrl (DNS layer)', () => {
  it('rejects when the host resolves to a loopback address (DNS rebinding)', async () => {
    jest.spyOn(dns.promises, 'resolve4').mockResolvedValue(['127.0.0.1']);
    const v = await guard.validateOutboundUrl('https://evil.example.com/v1');
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/private\/loopback/i);
  });

  it('rejects when any resolved A record is internal (multi-record hosts)', async () => {
    jest.spyOn(dns.promises, 'resolve4').mockResolvedValue(['104.18.6.148', '10.0.0.7']);
    jest.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);
    const v = await guard.validateOutboundUrl('https://mixed.example.com/v1');
    expect(v.ok).toBe(false);
  });

  it('accepts a host that resolves only to public IPs', async () => {
    jest.spyOn(dns.promises, 'resolve4').mockResolvedValue(['104.18.6.148']);
    jest.spyOn(dns.promises, 'resolve6').mockResolvedValue(['2606:4700::6812:694']);
    const v = await guard.validateOutboundUrl('https://api.openai.com/v1');
    expect(v.ok).toBe(true);
  });

  it('rejects DNS resolution failure', async () => {
    jest.spyOn(dns.promises, 'resolve4').mockRejectedValue(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }));
    jest.spyOn(dns.promises, 'resolve6').mockRejectedValue(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }));
    const v = await guard.validateOutboundUrl('https://nope.example.com/v1');
    expect(v.ok).toBe(false);
  });

  it('rejects the metadata IP even if DNS returns it', async () => {
    jest.spyOn(dns.promises, 'resolve4').mockResolvedValue(['169.254.169.254']);
    const v = await guard.validateOutboundUrl('https://metadata-lookalike.example.com/v1');
    expect(v.ok).toBe(false);
  });
});
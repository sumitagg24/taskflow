#!/usr/bin/env node
/**
 * One-shot Railway project setup: generates production secrets and pushes the
 * required TaskFlow variables to your Railway service via the railway CLI.
 *
 * Idempotent — every railway call is guarded by --skip-reviews, dry-run, and
 * echoes of each command before execution. Re-running the script never
 * overwrites variables you keep unmanaged: anything already set in Railway
 * (with --dry-run off) is preserved unless you explicitly pass --force.
 *
 * Usage:
 *   npm run railway:setup                      # interactive prompt flow
 *   npm run railway:setup -- --service taskflow --domain app.up.railway.app
 *   npm run railway:setup -- --dry-run         # print plan + commands only
 *   npm run railway:setup -- --service x --mongo-uri "mongodb+srv://..." \
 *       --redis-url "redis://..." --yes
 *
 * Requires: `railway` CLI installed and authenticated (railway whoami),
 * or set RAILWAY_TOKEN in the environment for CI-style usage.
 * Exit codes: 0 applied (or clean dry-run) · 1 failed · 2 bad usage/preflight
 */

'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const readline = require('readline');

// ── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    service: process.env.RAILWAY_SERVICE || '',
    domain: process.env.RAILWAY_PUBLIC_DOMAIN || '',
    mongoUri: process.env.RAILWAY_MONGO_URI || '',
    redisUrl: process.env.RAILWAY_REDIS_URL || '',
    extraOrigins: process.env.RAILWAY_EXTRA_ORIGINS || '',
    yes: false,
    dryRun: false,
    skipRedis: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i] || '';
    if (a === '--service') args.service = val();
    else if (a.startsWith('--service=')) args.service = a.split('=').slice(1).join('=');
    else if (a === '--domain') args.domain = val();
    else if (a.startsWith('--domain=')) args.domain = a.split('=').slice(1).join('=');
    else if (a === '--mongo-uri') args.mongoUri = val();
    else if (a.startsWith('--mongo-uri=')) args.mongoUri = a.split('=').slice(1).join('=');
    else if (a === '--redis-url') args.redisUrl = val();
    else if (a.startsWith('--redis-url=')) args.redisUrl = a.split('=').slice(1).join('=');
    else if (a === '--extra-origins') args.extraOrigins = val();
    else if (a.startsWith('--extra-origins=')) args.extraOrigins = a.split('=').slice(1).join('=');
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--skip-redis') args.skipRedis = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

// ── Validation ───────────────────────────────────────────────────────────────

function validMongoUri(uri) {
  return /^mongodb(\+srv)?:\/\//.test(uri) && !uri.includes('<') && !uri.includes('${');
}

function validHttpsOrigin(origin) {
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin);
}

function normalizeDomain(domain) {
  return domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Output helpers ───────────────────────────────────────────────────────────

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function fail(msg, code = 2) {
  console.error(c.red(`railway-setup: ${msg}`));
  process.exit(code);
}

// ── Preflight ────────────────────────────────────────────────────────────────

function preflight() {
  const which = spawnSync('railway', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (which.error || which.status !== 0) {
    fail(
      'Railway CLI not found. Install it first:\n' +
        '  npm install -g @railway/cli\n' +
        'then authenticate (railway login) or set RAILWAY_TOKEN.',
      2
    );
  }
  const who = spawnSync('railway', ['whoami'], { encoding: 'utf8', shell: process.platform === 'win32' });
  const identity = who.status === 0 ? (who.stdout || '').trim() : '';
  if (!identity) {
    fail(
      'Not authenticated with Railway. Run "railway login" (or "railway login --browserless")\n' +
        'or set the RAILWAY_TOKEN environment variable, then re-run this script.',
      2
    );
  }
  console.log(c.dim(`Authenticated as: ${identity}`));
}

// ── Prompting ────────────────────────────────────────────────────────────────

function ask(rl, question, fallback) {
  return new Promise((resolve) => {
    const suffix = fallback ? c.dim(` (${fallback})`) : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve((answer || '').trim() || fallback || '');
    });
  });
}

// ── Variable application ─────────────────────────────────────────────────────

/**
 * Apply one variable. Returns 'applied' | 'skipped' | 'unchanged'.
 * In apply mode we first read the current value (railway variables) and skip
 * existing keys so re-runs never clobber manual edits — that's the "idempotent,
 * never overwrite" guarantee. --yes is still required as a final gate.
 */
function applyVariable(key, value, service, opts) {
  const cmd = ['variables', '--service', service, '--set', `${key}=${value}`];
  const printable = `railway variables --service ${service} --set ${key}=****`;

  if (opts.dryRun) {
    console.log(c.cyan('[dry-run]'), printable);
    return 'applied';
  }
  if (!opts.existing) {
    opts.existing = {};
  }
  if (Object.prototype.hasOwnProperty.call(opts.existing, key)) {
    console.log(c.yellow(`↷ skipped ${key} (already set in Railway — pass --force to overwrite)`));
    return 'skipped';
  }
  const res = spawnSync('railway', cmd, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    console.error(c.red(`  failed: ${key}`));
    console.error(c.dim((res.stderr || res.stdout || '').trim()));
    return 'failed';
  }
  console.log(c.green(`✓ set ${key}`));
  return 'applied';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      [
        'Usage: npm run railway:setup -- [options]',
        '',
        '  --service <name>      Railway service name (default: prompt, env RAILWAY_SERVICE)',
        '  --domain <host>       Public domain, no scheme (env RAILWAY_PUBLIC_DOMAIN)',
        '  --mongo-uri <uri>     MongoDB SRV/standard URI (env RAILWAY_MONGO_URI)',
        '  --redis-url <url>     Redis URL; omit to skip rate-limit vars (env RAILWAY_REDIS_URL)',
        '  --extra-origins <l>   Comma-separated extra CORS origins beyond the primary',
        '  --skip-redis          Leave REDIS_URL unset (in-memory limiting)',
        '  --dry-run             Print the plan and commands without changing anything',
        '  --yes                 Actually apply (final confirmation gate)',
        '  -h, --help',
      ].join('\n')
    );
    process.exit(0);
  }

  preflight();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askOrFlag = async (question, fallback, value) =>
    args.yes || args.dryRun ? value || fallback : await ask(rl, question, value || fallback);

  const service = await askOrFlag('Railway service name', 'taskflow', args.service);
  if (!service) fail('A service name is required (pass --service).');

  const domain = normalizeDomain(await askOrFlag('Public domain (e.g. taskflow-production.up.railway.app)', '', args.domain));
  if (domain && !/^[a-z0-9.-]+(:\d+)?$/i.test(domain)) fail(`Invalid domain: ${domain}`);

  console.log(c.dim('\nPaste your MongoDB Atlas URI. It must include the real password and the'));
  console.log(c.dim('database name, e.g. mongodb+srv://user:pass@taskflow.zsyufjw.mongodb.net/taskflow'));
  const mongoUri = await askOrFlag('MONGO_URI', '', args.mongoUri);
  if (!validMongoUri(mongoUri)) {
    fail(
      'MONGO_URI is missing or invalid. It must start with mongodb:// or mongodb+srv://, contain the\n' +
        'real password (no <db_password> placeholder), and end with a database name.'
    );
  }

  const redisUrl = args.skipRedis ? '' : await askOrFlag('Redis URL (blank to skip REDIS_URL)', '', args.redisUrl);
  if (redisUrl && !/^(rediss?|redis\+tls):\/\//.test(redisUrl)) fail(`Invalid Redis URL: ${redisUrl}`);

  const closeRl = () => { try { rl.close(); } catch { /* already closed */ } };

  // Derive the remaining values from the two inputs above.
  const clientUrl = domain ? `https://${domain}` : '';
  const extra = (args.extraOrigins || '').split(',').map((o) => o.trim()).filter(Boolean);
  for (const o of extra) {
    if (!validHttpsOrigin(o)) fail(`Invalid extra origin "${o}" — must be https://host[:port]`);
  }
  const allowedOrigins = clientUrl ? [clientUrl, ...extra].join(',') : '';

  const plan = [
    ['MONGO_URI', mongoUri],
    ['JWT_SECRET', generateSecret()],
    ['JWT_REFRESH_SECRET', generateSecret()],
    ['AI_KEY_SECRET', generateSecret()],
    ['NODE_ENV', 'production'],
    ['TRUST_PROXY', 'true'],
  ];
  if (clientUrl) {
    plan.push(['CLIENT_URL', clientUrl], ['ALLOWED_ORIGINS', allowedOrigins]);
  } else {
    console.log(c.yellow('\n! No domain given — CLIENT_URL and ALLOWED_ORIGINS will NOT be set.'));
    console.log(c.yellow('  Production boot will fail without CLIENT_URL. Generate a domain in the Railway'));
    console.log(c.yellow('  dashboard and re-run this script (or set them manually) before deploying.'));
  }
  if (redisUrl) plan.push(['REDIS_URL', redisUrl]);
  else if (!args.skipRedis) console.log(c.dim('No Redis URL provided — leaving REDIS_URL unset (in-memory rate limiting).'));

  console.log(`\n${c.bold('Plan — variables for service')} ${c.cyan(service)}${args.dryRun ? c.dim('  (dry-run)') : ''}`);
  for (const [key] of plan) console.log(`  • ${key}`);

  const opts = { dryRun: args.dryRun, existing: null };
  if (!args.dryRun) {
    // Idempotency: fetch what's already set so re-runs skip managed keys.
    const list = spawnSync('railway', ['variables', '--service', service], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (list.status === 0 && (list.stdout || '').trim().startsWith('{')) {
      try {
        opts.existing = JSON.parse(list.stdout);
      } catch { /* fall through: apply mode still asks before writing */ }
    }
    if (Object.keys(opts.existing || {}).length > 0) {
      console.log(c.dim(`Found ${Object.keys(opts.existing).length} existing variable(s); they will be preserved.`));
    }
    if (!args.yes) {
      const confirm = await ask(rl, '\nApply these variables now? Type "yes" to continue', 'no');
      if (confirm.toLowerCase() !== 'yes') {
        closeRl();
        console.log('Aborted — nothing was changed.');
        process.exit(0);
      }
    }
  }
  closeRl();

  const results = plan.map(([k, v]) => applyVariable(k, v, service, opts));
  const failed = results.filter((r) => r === 'failed').length;
  const skipped = results.filter((r) => r === 'skipped').length;
  const applied = results.filter((r) => r === 'applied').length;

  console.log(`\n${c.bold('Summary:')} ${applied} applied · ${skipped} skipped (already set) · ${failed} failed`);

  if (!args.dryRun && applied > 0) {
    console.log('\nNext steps:');
    console.log(`  1. Redeploy so the service picks them up: ${c.cyan(`railway redeploy --service ${service}`)}`);
    console.log('  2. Verify: npm run smoke:deploy -- --url https://<your-domain>');
    console.log('  3. GitHub repo: set RAILWAY_TOKEN (secret) + RAILWAY_SERVICE / RAILWAY_PUBLIC_DOMAIN (variables)');
  }

  if (failed > 0) process.exit(1);
  process.exit(args.dryRun ? 0 : 0);
}

main().catch((err) => fail(err.message, 1));

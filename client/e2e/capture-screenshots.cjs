const { chromium } = require('playwright');
const BASE = 'http://localhost:5000';
const OUT = require('path').resolve(__dirname, 'screenshots');

const shot = async (page, name) => {
  await page.screenshot({ path: require('path').join(OUT, `${name}.png`) });
  console.log(`captured ${name}.png`);
};

async function register(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const signUp = page.locator('button').filter({ hasText: /^Sign Up$/ }).first();
  if (await signUp.count()) { try { await signUp.click({ timeout: 2000 }); await page.waitForTimeout(500); } catch {} }
  await page.waitForSelector('input[placeholder="Your full name"]', { timeout: 5000 });
  const uniqueId = Date.now();
  await page.locator('input[placeholder="Your full name"]').fill('Demo User');
  await page.locator('input[placeholder="Choose a unique username"]').fill('demouser' + uniqueId);
  await page.locator('input[placeholder="you@example.com"]').fill('demo' + uniqueId + '@taskflow.app');
  await page.locator('input[aria-label="New password"]').fill('Password123!');
  await page.locator('input[aria-label="Confirm new password"]').fill('Password123!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
}

async function gotoNav(page, label) {
  const item = page.locator('button').filter({ hasText: new RegExp(`${label}`, 'i') }).first();
  if (await item.count()) { await item.click({ timeout: 3000 }); await page.waitForTimeout(1800); return true; }
  return false;
}

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, '01-login');
  await shot(page, '02-signup');

  await register(page);

  if (await page.locator('input[placeholder="you@example.com or username"]').count()) {
    await page.locator('button').filter({ hasText: /^Sign In$/ }).first().click();
    await page.waitForTimeout(500);
    await page.locator('input[placeholder="you@example.com or username"]').fill('demo@taskflow.app');
    await page.locator('input[placeholder="Enter your password"]').fill('password123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
  }

  await page.waitForTimeout(2500);
  await shot(page, '03-dashboard');

  for (const [label, file] of [
    ['All Tasks', '04-kanban'],
    ['Calendar', '05-calendar'],
    ['Analytics', '06-analytics'],
    ['Focus Timer', '07-focus-timer'],
    ['Ask AI', '08-ai-assistant'],
    ['Settings', '09-settings'],
  ]) {
    const ok = await gotoNav(page, label);
    if (ok) await shot(page, file);
    else console.log(`nav not found: ${label}`);
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

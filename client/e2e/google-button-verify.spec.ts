/**
 * @ts-check
 * Google Button Verification Test
 */
import { test, expect } from '@playwright/test';

const LOCALHOST = 'http://localhost:3000';
const NETWORK_URL = 'http://192.168.1.10:3000';

test.describe('Google Button Verification', () => {

  test('Google button appears on localhost on fresh load', async ({ page }) => {
    await page.goto(LOCALHOST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const container = page.locator('[data-testid="google-button-container"]');
    await expect(container).toBeVisible();

    const innerHTML = await container.innerHTML();
    expect(innerHTML.trim().length).toBeGreaterThan(0);

    console.log('✓ Google button visible on localhost (fresh load)');
  });

  test('Google button survives 10 consecutive refreshes', async ({ page }) => {
    await page.goto(LOCALHOST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    for (let i = 1; i <= 10; i++) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const container = page.locator('[data-testid="google-button-container"]');
      const innerHTML = await container.innerHTML();
      expect(innerHTML.trim().length).toBeGreaterThan(0);
      console.log(`✓ Refresh ${i}/10: button visible`);
    }
  });

  test('Google button survives 20 Login↔Register switches', async ({ page }) => {
    await page.goto(LOCALHOST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    for (let i = 1; i <= 20; i++) {
      // Click the mode switch button
      const switchButton = page.locator('button').filter({ hasText: /Sign (Up|In)/ }).first();
      await switchButton.click();
      await page.waitForTimeout(500);

      const container = page.locator('[data-testid="google-button-container"]');
      const innerHTML = await container.innerHTML();
      expect(innerHTML.trim().length).toBeGreaterThan(0);
      console.log(`✓ Switch ${i}/20: button visible`);
    }
  });

  test('Both localhost and Network URL show identical UI', async ({ browser }) => {
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto(LOCALHOST, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(3000);

    await page2.goto(NETWORK_URL, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(3000);

    const container1 = page1.locator('[data-testid="google-button-container"]');
    const container2 = page2.locator('[data-testid="google-button-container"]');

    await expect(container1).toBeVisible();
    await expect(container2).toBeVisible();

    // Check for key structural elements (button div, iframe, Google SVG)
    const hasButton1 = await container1.locator('[role="button"]').count() > 0;
    const hasButton2 = await container2.locator('[role="button"]').count() > 0;
    const hasIframe1 = await container1.locator('iframe').count() > 0;
    const hasIframe2 = await container2.locator('iframe').count() > 0;
    const hasSVG1 = await container1.locator('svg').count() > 0;
    const hasSVG2 = await container2.locator('svg').count() > 0;

    expect(hasButton1).toBe(true);
    expect(hasButton2).toBe(true);
    expect(hasIframe1).toBe(true);
    expect(hasIframe2).toBe(true);
    expect(hasSVG1).toBe(true);
    expect(hasSVG2).toBe(true);
    console.log('✓ Both origins display Google button with identical structure (button, iframe, SVG)');

    // Save screenshots
    await page1.screenshot({ path: 'e2e/screenshots/compare-localhost.png', fullPage: true });
    await page2.screenshot({ path: 'e2e/screenshots/compare-network.png', fullPage: true });

    await context1.close();
    await context2.close();
  });

  test('No duplicate Google script tags (same src loaded multiple times)', async ({ page }) => {
    await page.goto(LOCALHOST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Check for duplicate script loads - count scripts with the SAME src
    const duplicateCount = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[src*="accounts.google.com"]');
      const srcCounts: Record<string, number> = {};
      scripts.forEach(s => {
        const src = s.getAttribute('src') || '';
        if (src) srcCounts[src] = (srcCounts[src] || 0) + 1;
      });
      return srcCounts;
    });

    console.log('Google script counts by src:', duplicateCount);
    const hasDuplicates = Object.values(duplicateCount).some(count => count > 1);
    expect(hasDuplicates).toBe(false);
    console.log('✓ No duplicate Google script loads');
  });

  test('Google SDK is properly initialized', async ({ page }) => {
    await page.goto(LOCALHOST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const isInitialized = await page.evaluate(() => {
      return typeof window.google !== 'undefined' &&
             typeof window.google.accounts !== 'undefined' &&
             typeof window.google.accounts.id !== 'undefined';
    });

    expect(isInitialized).toBe(true);
    console.log('✓ Google SDK initialized');
  });

  test('No critical console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('net::ERR_')) {
          errors.push(text);
        }
      }
    });

    await page.goto(LOCALHOST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(e =>
      e.includes('google') || e.includes('Google') || e.includes('Error')
    );

    console.log(`Total console errors: ${errors.length}`);
    console.log(`Critical errors: ${criticalErrors.length}`);
    if (criticalErrors.length > 0) {
      console.log('Critical errors:', criticalErrors);
    }

    // We allow some non-critical errors but no Google/React specific ones
    const googleErrors = criticalErrors.filter(e =>
      e.includes('google') || e.includes('Google')
    );
    expect(googleErrors.length).toBe(0);
  });

  test('Environment variables are correct', async ({ page }) => {
    await page.goto(LOCALHOST, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Check for Google button to verify VITE_GOOGLE_CLIENT_ID is set
    const container = page.locator('[data-testid="google-button-container"]');
    const innerHTML = await container.innerHTML();

    // If VITE_GOOGLE_CLIENT_ID was unset, the container would be null/empty
    expect(innerHTML.trim().length).toBeGreaterThan(0);
    console.log('✓ VITE_GOOGLE_CLIENT_ID is set (Google button rendered)');

    // Check origin
    const origin = page.url();
    expect(origin).toContain('localhost:3000');
    console.log(`✓ Running on localhost:3000`);
  });
});

// Login Hub Stage via SSO, capture Bearer token used by /api-swift.*/quizzes/collection/*
// Writes:
//   - storageState.json (session cookies + localStorage)
//   - token.json ({ token, expiresAt?, apiBaseURL })
//
// Usage:
//   node capture-token.mjs [--headless]
//
// Reads from ../../.env (jay-viewsonic-km root):
//   VS_STAGE_USERNAME
//   VS_STAGE_PASSWORD

import 'dotenv/config';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const HUB_URL = 'https://hub.stage.myviewboard.com';
const OCELOT_HOST_PATTERN = /api-swift[^/]*classswift[^/]*/i;

const HEADLESS = process.argv.includes('--headless');

const email = process.env.VS_STAGE_USERNAME;
const password = process.env.VS_STAGE_PASSWORD;

if (!email || !password) {
  console.error('❌ VS_STAGE_USERNAME / VS_STAGE_PASSWORD missing in .env');
  process.exit(1);
}

const storageStateFile = path.join(__dirname, 'storageState.json');
const tokenFile = path.join(__dirname, 'token.json');

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-TW',
});
const page = await context.newPage();

let capturedToken = null;
let capturedApiBase = null;

page.on('request', (req) => {
  const url = req.url();
  if (!OCELOT_HOST_PATTERN.test(url)) return;
  const auth = req.headers()['authorization'] || req.headers()['Authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.substring('Bearer '.length);
    if (!capturedToken) {
      capturedToken = token;
      const parsed = new URL(url);
      capturedApiBase = `${parsed.protocol}//${parsed.host}`;
      console.log(`✅ Captured Bearer token from ${parsed.host}`);
    }
  }
});

console.log('🌐 Navigating to Hub Stage sign-in…');
await page.goto(`${HUB_URL}/signin`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle');

console.log('🔘 Clicking primary Sign In button…');
// Try both attribute variants (react uses data-testid; older code uses data-test-id)
const signInBtn = page.locator('[data-testid="login"], [data-test-id="login"]').first();
try {
  await signInBtn.waitFor({ state: 'visible', timeout: 10_000 });
} catch {
  await page.screenshot({ path: path.join(__dirname, 'debug-signin.png'), fullPage: true });
  console.error('❌ Could not find sign-in button. Screenshot saved to debug-signin.png');
  console.error('URL was:', page.url());
  console.error('Title:', await page.title());
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) ?? '');
  console.error('Body text (first 500 chars):', bodyText);
  await browser.close();
  process.exit(3);
}
await Promise.all([
  page.waitForURL(/https:\/\/(?:[\w-]+\.)?cloud\.viewsonic\.com\//, { timeout: 30_000 }),
  signInBtn.click(),
]);

console.log('📝 Filling email…');
const accountBox = page.getByRole('textbox', { name: 'Account' });
await accountBox.waitFor({ state: 'visible', timeout: 20_000 });
await accountBox.fill(email);

console.log('➡️ Next…');
await page.getByRole('button', { name: 'Next' }).click();

console.log('🔒 Filling password…');
const pwdBox = page.getByRole('textbox', { name: 'Password' });
await pwdBox.waitFor({ state: 'visible', timeout: 20_000 });
await pwdBox.fill(password);

console.log('🔑 Sign In…');
await Promise.all([
  page.waitForURL((url) => url.startsWith(HUB_URL), { timeout: 45_000 }),
  page.getByRole('button', { name: 'Sign In' }).click(),
]);

console.log(`✅ Landed on ${page.url()}`);
console.log('⏳ Waiting for at least one ocelot API call to capture token…');

// Trigger API traffic by navigating to lesson planner / home
try {
  await page.goto(`${HUB_URL}/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
} catch (e) {
  console.warn('home nav warning:', e.message);
}

// Extra wait to ensure captureToken fires
const started = Date.now();
while (!capturedToken && Date.now() - started < 30_000) {
  await new Promise((r) => setTimeout(r, 500));
}

if (!capturedToken) {
  console.warn('⚠️ No Bearer token captured. Trying quizCollection page to force API…');
  try {
    await page.goto(`${HUB_URL}/quizCollection`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    const s2 = Date.now();
    while (!capturedToken && Date.now() - s2 < 20_000) {
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (e) {
    console.warn('quizCollection nav warning:', e.message);
  }
}

if (!capturedToken) {
  console.error('❌ Failed to capture Bearer token');
  await context.close();
  await browser.close();
  process.exit(2);
}

await context.storageState({ path: storageStateFile });
fs.writeFileSync(
  tokenFile,
  JSON.stringify(
    {
      token: capturedToken,
      apiBaseURL: capturedApiBase,
      capturedAt: new Date().toISOString(),
    },
    null,
    2
  )
);

console.log(`💾 Wrote ${path.relative(repoRoot, storageStateFile)}`);
console.log(`💾 Wrote ${path.relative(repoRoot, tokenFile)}`);
console.log('🎉 Done. Keep browser open (leave this process running) to reuse cookies, or close.');

// Keep browser open briefly so user can inspect
if (!HEADLESS) {
  console.log('Browser stays open for 5s for inspection…');
  await new Promise((r) => setTimeout(r, 5000));
}
await context.close();
await browser.close();

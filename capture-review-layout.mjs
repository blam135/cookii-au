import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const folder = 'review-layout-media';
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch();
const reviews = [
  { id: 'one', name: 'Mia', rating: 5, text: 'The brown butter batch was my favourite. Crisp edges and just the right amount of chocolate.' },
  { id: 'two', name: 'Alex', rating: 5, text: 'Brought the matcha cookies to afternoon tea. The box came home empty.' },
];
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', colorScheme: 'light' });
await page.route('https://reviews.example.invalid/reviews', route => route.fulfill({ json: reviews }));
await page.goto('http://127.0.0.1:3000/#reviews');
await page.getByText('Mia', {exact: false}).last().waitFor();
await page.evaluate(() => document.fonts.ready);
const status = page.locator('.review-verification-status');
let mode = 'Cloudflare public test widget';
try {
  await page.waitForFunction(() => document.querySelector('.review-verification-status')?.textContent === 'Verification complete.', { }, {timeout: 22000});
} catch {
  mode = 'Simulated widget; the external test service did not complete on the runner';
  await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: `window.turnstile = {
    render: (element, options) => {
      element.style.cssText += ';display:flex;align-items:center;justify-content:space-between;padding:0 16px;border:1px solid #c9c9c9;border-radius:3px;background:#fafafa;color:#222;font:14px Arial,sans-serif';
      element.innerHTML = '<span>✓ &nbsp; Verification passed</span><small>Test widget</small>';
      setTimeout(() => options.callback('demo-only'), 100);
      return 'review-demo';
    }, remove: () => {}
  };` }));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.review-verification-status')?.textContent === 'Verification complete.');
}
await page.evaluate(() => document.fonts.ready);
await page.locator('.reviews-layout').evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 114));
await page.screenshot({path: folder + '/desktop.png', animations: 'disabled'});
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('.reviews-heading').evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 102));
await page.screenshot({path: folder + '/mobile.png', animations: 'disabled'});
await page.locator('.review-form').evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().bottom - window.innerHeight + 24));
await page.screenshot({path: folder + '/mobile-verification.png', animations: 'disabled'});
writeFileSync(folder + '/capture.txt', mode + '\n' + await status.innerText() + '\n');
await browser.close();

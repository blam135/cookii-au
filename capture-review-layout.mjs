import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const folder = 'review-layout-media/pr-41';
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch();
const fixture = { id: 'first', name: 'Alex', rating: 5, text: 'Brought the matcha cookies to afternoon tea. The box came home empty.' };

async function preview(width, height, port) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce', colorScheme: 'light' });
  const rows = [fixture];
  await page.route('https://reviews.example.invalid/reviews', async route => {
    if (route.request().method() === 'POST') {
      const { name, rating, text } = route.request().postDataJSON();
      const saved = { id: 'demo', name, rating, text };
      rows.unshift(saved);
      return route.fulfill({ status: 201, json: [saved] });
    }
    return route.fulfill({ json: rows });
  });
  await page.goto('http://127.0.0.1:' + port + '/#reviews');
  await expect(page.locator('.review-author')).toContainText('Alex');
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function position(page, target, offset) {
  await page.locator(target).evaluate((el, offset) => scrollTo(0, scrollY + el.getBoundingClientRect().top - offset), offset);
}
const desktop = await preview(1920, 1000, 3000);
const submit = desktop.getByRole('button', { name: /Share a little love/ });
await expect(submit).toBeEnabled({ timeout: 30000 });
await desktop.getByRole('textbox', { name: 'Your name' }).fill('Mia');
await desktop.getByRole('textbox', { name: 'Your cookie moment' }).fill('The brown butter batch was my favourite. Crisp edges and just the right amount of chocolate.');
await submit.click();
const feedback = desktop.locator('.review-form').getByRole('status');
await expect(feedback).toHaveCount(1);
await expect(feedback).toHaveText('Your review has been published.');
await expect(submit).toBeEnabled({ timeout: 30000 });
await position(desktop, '.reviews-layout', 115);
await desktop.screenshot({ path: folder + '/desktop-published.png', animations: 'disabled' });
const mobile = await preview(390, 1050, 3001);
const mobileButton = mobile.getByRole('button', { name: /Share a little love/ });
await mobile.locator('iframe[src*="challenges.cloudflare.com"]').waitFor({state:'attached',timeout:30000}).catch(() => {});
await mobile.waitForTimeout(2000);
await expect(mobileButton).toBeDisabled();
await expect(mobile.locator('.review-form').getByRole('status')).toBeEmpty();
await position(mobile, '.reviews-heading', 102);
await mobile.screenshot({ path: folder + '/mobile-unverified.png', animations: 'disabled' });
await browser.close();

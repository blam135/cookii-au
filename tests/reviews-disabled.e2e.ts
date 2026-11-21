import { expect, test } from '@playwright/test';

test('disabled reviews render no UI and make no review or verification requests', async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_REVIEWS_ENABLED === 'true',
    'This scenario requires a build with reviews disabled.',
  );
  const requests: string[] = [];
  for (const url of ['**/reviews', 'https://challenges.cloudflare.com/**']) {
    await page.route(url, (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
  }
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('#reviews')).toHaveCount(0);
  expect(requests).toEqual([]);
});

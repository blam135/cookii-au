import { expect, test, type Page } from '@playwright/test';

test.skip(
  process.env.NEXT_PUBLIC_REVIEWS_ENABLED !== 'true',
  'These scenarios require a build with reviews enabled.',
);

const api = '**/reviews';
const demoName = 'UI test customer';
const demoText = 'A review used only by the isolated browser tests.';

async function setup(
  page: Page,
  options: { blocked?: boolean; rejected?: boolean } = {},
) {
  const rows = [
    {
      id: 'sample',
      name: 'Sample customer',
      rating: 5,
      text: 'Sample review for isolated UI checks.',
    },
  ];
  let submissions = 0;
  await page.route(api, async (route) => {
    if (route.request().method() === 'POST') {
      submissions++;
      if (options.rejected)
        return route.fulfill({
          status: 403,
          json: { message: 'Private upstream detail' },
        });
      const { name, rating, text } = route.request().postDataJSON();
      const saved = { id: 'saved-by-test', name, rating, text };
      rows.unshift(saved);
      return route.fulfill({ status: 201, json: [saved] });
    }
    return route.fulfill({ json: rows });
  });
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    options.blocked
      ? route.abort()
      : route.fulfill({
          contentType: 'application/javascript',
          body: `window.turnstile = {
      render: (element, options) => {
        window.__reviewVerification = options;
        element.textContent = 'Verification is simulated for isolated UI tests.';
        return 'ui-test-widget';
      },
      remove: () => {}
    };`,
        }),
  );
  await page.goto('/#reviews');
  await expect(
    page.locator('.review-author').filter({ hasText: 'Sample customer' }),
  ).toBeVisible();
  if (!options.blocked)
    await page.waitForFunction(() => '__reviewVerification' in window);
  return () => submissions;
}

async function fill(page: Page) {
  await page.getByRole('textbox', { name: 'Your name' }).fill(demoName);
  await page
    .getByRole('textbox', { name: 'Your cookie moment' })
    .fill(demoText);
}

async function verify(
  page: Page,
  event: 'success' | 'error' | 'expired' = 'success',
) {
  await page.evaluate((event) => {
    const callbacks = (
      window as unknown as Window & {
        __reviewVerification: {
          callback: (token: string) => void;
          'error-callback': () => void;
          'expired-callback': () => void;
        };
      }
    ).__reviewVerification;
    if (event === 'success') callbacks.callback('test-only-token');
    else if (event === 'error') callbacks['error-callback']();
    else callbacks['expired-callback']();
  }, event);
}

test('loads reviews and blocks submission until verification completes', async ({
  page,
}) => {
  const submissions = await setup(page);
  await fill(page);
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeDisabled();
  expect(submissions()).toBe(0);
});

test('publishes a review through the form and loads it after refresh', async ({
  page,
}) => {
  const submissions = await setup(page);
  await fill(page);
  await verify(page);
  await page.getByRole('button', { name: /Share a little love/ }).click();
  await expect(page.locator('.review-status')).toContainText(
    'Your review has been published.',
  );
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveValue(
    '',
  );
  await expect(
    page.locator('.review-author').filter({ hasText: demoName }),
  ).toBeVisible();
  expect(submissions()).toBe(1);
  await page.reload();
  await expect(
    page.locator('.review-author').filter({ hasText: demoName }),
  ).toBeVisible();
});

test('a blocked verification script displays a useful error', async ({
  page,
}) => {
  await setup(page, { blocked: true });
  await expect(page.locator('.review-verification-status')).toContainText(
    'We couldn’t load the verification.',
  );
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeDisabled();
});

test('challenge failure is visible and keeps the form', async ({ page }) => {
  await setup(page);
  await fill(page);
  await verify(page, 'error');
  await expect(page.locator('.review-verification-status')).toContainText(
    'Verification failed.',
  );
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveValue(
    demoName,
  );
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeDisabled();
});

test('expiry disables submission until a new verification completes', async ({
  page,
}) => {
  await setup(page);
  await verify(page);
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeEnabled();
  await verify(page, 'expired');
  await expect(page.locator('.review-verification-status')).toContainText(
    'Verification expired.',
  );
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeDisabled();
  await verify(page);
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeEnabled();
});

test('a server verification rejection asks for a fresh challenge without losing input', async ({
  page,
}) => {
  await setup(page, { rejected: true });
  await fill(page);
  await verify(page);
  await page.getByRole('button', { name: /Share a little love/ }).click();
  await expect(page.locator('.review-status')).toContainText(
    'Verification failed. Please verify again',
  );
  await expect(
    page.getByRole('textbox', { name: 'Your cookie moment' }),
  ).toHaveValue(demoText);
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeDisabled();
  await expect(page.locator('.review-status')).not.toContainText(
    'Private upstream detail',
  );
});

test('mobile verification and its errors stay within the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await verify(page, 'error');
  await page.locator('.review-form').scrollIntoViewIfNeeded();
  await expect(page.locator('.review-verification-status')).toContainText(
    'Verification failed.',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('stored hostile review fields remain text after submission and reload', async ({
  page,
}) => {
  const submissions = await setup(page);
  const name = '<img src=x onerror=alert(1)>';
  const text =
    '<script>alert(1)</script><svg onload=alert(1)> SELECT * FROM reviews; --';
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole('textbox', { name: 'Your name' }).fill(name);
  await page.getByRole('textbox', { name: 'Your cookie moment' }).fill(text);
  await verify(page);
  await page.getByRole('button', { name: /Share a little love/ }).click();
  await expect(page.locator('.review-status')).toContainText(
    'Your review has been published.',
  );
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    const review = page.locator('.review-card').filter({ hasText: text });
    await expect(review).toBeVisible();
    await expect(review.locator('blockquote')).toHaveText(`“${text}”`);
    await expect(review.locator('.review-author')).toContainText(name);
    // Assert safe DOM structure even if CSP would independently prevent execution.
    await expect(
      review.locator('[onerror], [onload], script, img, iframe'),
    ).toHaveCount(0);
  }
  expect(dialogs).toEqual([]);
  expect(submissions()).toBe(1);
});

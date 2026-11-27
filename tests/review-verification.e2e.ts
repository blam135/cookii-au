import { expect, test, type Page } from '@playwright/test';
import { injectionPayloads } from './fixtures/injection-payloads.mjs';

test.skip(
  process.env.NEXT_PUBLIC_REVIEWS_ENABLED !== 'true',
  'These scenarios require a build with reviews enabled.',
);

const api = '**/reviews';
const demoName = 'UI test customer';
const demoText = 'A review used only by the isolated browser tests.';

async function setup(
  page: Page,
  options: {
    blocked?: boolean;
    rejected?: boolean;
    loadFailed?: boolean;
    pendingLoad?: Promise<void>;
    pendingSave?: Promise<void>;
  } = {},
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
      if (options.pendingSave) await options.pendingSave;
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
    const loaded = structuredClone(rows);
    if (options.pendingLoad) await options.pendingLoad;
    if (options.loadFailed) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: loaded });
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
  if (!options.pendingLoad && !options.loadFailed)
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
  const formStatus = page.locator('.review-form').getByRole('status');
  await expect(formStatus).toBeEmpty();
  await verify(page);
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeEnabled();
  await expect(formStatus).toBeEmpty();
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
  const formStatus = page.locator('.review-form').getByRole('status');
  await expect(formStatus).toHaveCount(1);
  await expect(formStatus).toHaveText('Your review has been published.');
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeDisabled();
  // A new widget must work with the script already loaded after submission.
  await verify(page);
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeEnabled();
  await expect(formStatus).toHaveText('Your review has been published.');
  await page.getByRole('textbox', { name: 'Your name' }).fill('Next customer');
  await expect(formStatus).toBeEmpty();
  await page.reload();
  await expect(
    page.locator('.review-author').filter({ hasText: demoName }),
  ).toBeVisible();
});

test('a blocked verification script displays a useful error', async ({
  page,
}) => {
  await setup(page, { blocked: true });
  await expect(page.locator('.review-status')).toContainText(
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
  await expect(page.locator('.review-status')).toContainText(
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
  await expect(page.locator('.review-status')).toContainText(
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

test('verification fits the form as the review layout changes columns', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await verify(page, 'error');
  const widget = page.getByLabel('Spam verification');
  const status = page.locator('.review-status');
  await expect(status).toContainText('Verification failed.');
  for (const width of [320, 390, 900, 901, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const [form, heading, list, field, verification, notice] =
      await Promise.all(
        [
          page.locator('.review-form'),
          page.locator('.reviews-heading'),
          page.locator('.review-list'),
          page.getByRole('textbox', { name: 'Your name' }),
          widget,
          status,
        ].map((locator) => locator.boundingBox()),
      );
    if (!form || !heading || !list || !field || !verification || !notice)
      throw new Error('Review layout is missing');
    expect(form.x).toBeGreaterThanOrEqual(0);
    expect(form.x + form.width).toBeLessThanOrEqual(width);
    expect(verification.width).toBeGreaterThanOrEqual(300);
    expect(verification.width).toBeCloseTo(field.width, 0);
    expect(verification.x).toBeCloseTo(field.x, 0);
    expect(verification.height).toBeLessThan(verification.width);
    expect(notice.y).toBeGreaterThanOrEqual(
      verification.y + verification.height,
    );
    if (width === 1920) {
      expect(form.x).toBeLessThan(width * 0.14);
      expect(form.width).toBeGreaterThan(width * 0.3);
    }
    if (width <= 900) {
      expect(form.x).toBeCloseTo(heading.x, 0);
      expect(form.y).toBeGreaterThanOrEqual(heading.y + heading.height);
      expect(list.y).toBeGreaterThanOrEqual(form.y + form.height);
    } else {
      expect(form.y).toBeCloseTo(heading.y, 0);
      expect(heading.x).toBeGreaterThanOrEqual(form.x + form.width);
      expect(list.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    }
  }
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

for (const { name, text } of injectionPayloads) {
  test(`loaded review renders ${name} as inert text`, async ({ page }) => {
    await page.route('**/reviews', (route) =>
      route.fulfill({
        json: [
          {
            id: 'hostile',
            name: '<img src=x onerror=alert(1)>',
            rating: 5,
            text,
          },
        ],
      }),
    );
    await page.route('https://challenges.cloudflare.com/**', (route) =>
      route.abort(),
    );
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.goto('/#reviews');
    const review = page.locator('.review-card');
    await expect(review.locator('blockquote')).toHaveText(`“${text}”`);
    await expect(
      review.locator('script, img, iframe, a, [onerror], [onload]'),
    ).toHaveCount(0);
    await expect(review.locator('.review-author')).toContainText(
      '<img src=x onerror=alert(1)>',
    );
    expect(dialogs).toEqual([]);
  });
}

test('focus and reconnect do not refetch reviews', async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/reviews') && request.method() === 'GET')
      reads++;
  });
  await setup(page);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
  await page.clock.fastForward(60_000);
  expect(reads).toBe(1);
});

test('failed reads remain visible without automatic retries', async ({
  page,
}) => {
  await page.clock.install();
  let reads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/reviews') && request.method() === 'GET')
      reads++;
  });
  await setup(page, { loadFailed: true });
  await expect(page.locator('.review-list')).toContainText(
    'We couldn’t load reviews.',
  );
  await page.clock.fastForward(60_000);
  expect(reads).toBe(1);
});

test('a slow initial read cannot replace a confirmed submission or cause another fetch', async ({
  page,
}) => {
  let release!: () => void;
  const pendingLoad = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/reviews') && request.method() === 'GET')
      reads++;
  });
  const submissions = await setup(page, { pendingLoad });
  try {
    await fill(page);
    await verify(page);
    await page.getByRole('button', { name: /Share a little love/ }).click();
    await expect(page.locator('.review-status')).toContainText(
      'Your review has been published.',
    );
  } finally {
    release();
  }
  await expect(page.getByText('Loading sweet words…')).toBeHidden();
  await expect(
    page.locator('.review-card').filter({ hasText: demoText }),
  ).toHaveCount(1);
  expect(submissions()).toBe(1);
  expect(reads).toBe(1);
});

test('form validation rejects whitespace without consuming verification', async ({
  page,
}) => {
  const submissions = await setup(page);
  await fill(page);
  await page.getByRole('textbox', { name: 'Your name' }).fill('   ');
  await verify(page);
  await page.getByRole('button', { name: /Share a little love/ }).click();
  await expect(page.locator('.review-status')).toContainText(
    'Please add your name',
  );
  expect(submissions()).toBe(0);
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveValue(
    '   ',
  );
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeEnabled();
});

test('rapid submissions send one trimmed review with the chosen rating and reset on success', async ({
  page,
}) => {
  let release!: () => void;
  const pendingSave = new Promise<void>((resolve) => {
    release = resolve;
  });
  const payloads: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/reviews') && request.method() === 'POST')
      payloads.push(request.postDataJSON());
  });
  const submissions = await setup(page, { pendingSave });
  await page
    .getByRole('textbox', { name: 'Your name' })
    .fill(`  ${demoName}  `);
  await page
    .getByRole('textbox', { name: 'Your cookie moment' })
    .fill(`  ${demoText}  `);
  await page.getByRole('radio', { name: '2 stars', exact: true }).check();
  await verify(page);
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeEnabled();
  try {
    await page.locator('.review-form').evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect.poll(submissions).toBe(1);
    await expect(page.getByRole('button', { name: /Sharing/ })).toBeDisabled();
    await expect(
      page.getByRole('textbox', { name: 'Your name' }),
    ).toHaveAttribute('readonly', '');
  } finally {
    release();
  }
  await expect(page.locator('.review-status')).toContainText(
    'Your review has been published.',
  );
  expect(payloads).toEqual([
    {
      name: demoName,
      text: demoText,
      rating: 2,
      turnstileToken: 'test-only-token',
    },
  ]);
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveValue(
    '',
  );
  await expect(
    page.getByRole('radio', { name: '5 stars', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('button', { name: /Share a little love/ }),
  ).toBeDisabled();
});

import assert from 'node:assert/strict';
import { test } from './fixtures.mjs';
import { mock } from 'node:test';

process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'public-test-sitekey';
process.env.NEXT_PUBLIC_REVIEWS_API_URL = 'https://example.com/';
const { loadReviews, saveReview } = await import('../lib/reviews.ts');
const row = { id: 'test-id', name: 'Sam', text: 'Lovely cookies', rating: 5 };

test('appends /reviews to the base URL without a duplicate slash or credentials', async () => {
  mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://example.com/reviews');
    assert.equal(init.headers.apikey, undefined);
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.cache, 'no-store');
    return Response.json([row]);
  });
  assert.deepEqual(await loadReviews(), [row]);
});

test('saves trimmed fields and uses the server-assigned record', async () => {
  mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(_url, 'https://example.com/reviews');
    assert.deepEqual(JSON.parse(init.body), {
      name: 'Sam',
      text: 'Lovely cookies',
      rating: 5,
      turnstileToken: 'challenge',
    });
    return Response.json([row], { status: 201 });
  });
  assert.deepEqual(
    await saveReview(
      { name: ' Sam ', text: ' Lovely cookies ', rating: 5 },
      'challenge',
    ),
    row,
  );
});

test('rejects invalid input before making a request', async () => {
  const fetch = mock.method(globalThis, 'fetch', () => {
    throw new Error('must not fetch');
  });
  for (const input of [
    { ...row, name: ' ' },
    { ...row, name: 'x'.repeat(41) },
    { ...row, text: 'x'.repeat(401) },
    { ...row, rating: 6 },
    { ...row, rating: 1.5 },
  ]) {
    await assert.rejects(saveReview(input, 'challenge'), /Please enter/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('surfaces database failures and malformed responses', async () => {
  const fetch = mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 503 }),
  );
  await assert.rejects(saveReview(row, 'challenge'), /Unable to access/);
  fetch.mock.mockImplementation(async () =>
    Response.json([{ ...row, rating: 9 }]),
  );
  await assert.rejects(loadReviews(), /Unexpected reviews/);
  fetch.mock.mockImplementation(async () => Response.json([]));
  await assert.rejects(saveReview(row, 'challenge'), /Unexpected save/);
});

test('verification rejections ask the customer to verify again', async () => {
  mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: 'private verification detail' }, { status: 403 }),
  );
  await assert.rejects(
    saveReview(row, 'rejected-challenge'),
    (error) =>
      error.status === 403 &&
      /Verification failed/.test(error.message) &&
      !error.message.includes('private'),
  );
});

test('handles rate limits without exposing server details', async () => {
  mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: 'private database detail' }, { status: 429 }),
  );
  await assert.rejects(saveReview(row, 'challenge'), /Too many reviews/);
});

test('does not forward attacker-controlled metadata', async () => {
  mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.deepEqual(Object.keys(JSON.parse(init.body)).sort(), [
      'name',
      'rating',
      'text',
      'turnstileToken',
    ]);
    return Response.json([row]);
  });
  await saveReview(
    { ...row, approved: true, created_at: '2000-01-01' },
    'challenge',
  );
});

test('renders malicious review text as text, never HTML', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const attack = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const markup = renderToStaticMarkup(
    createElement('blockquote', null, attack),
  );
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.ok(!markup.includes('<script>'));
  assert.ok(!markup.includes('<img'));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
const { loadReviews, saveReview } = await import('../lib/reviews.ts');
const row = { id: 'test-id', name: 'Sam', text: 'Lovely cookies', rating: 5 };

test('loads latest reviews using public key without a bearer secret', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(url, /order=created_at.desc,id.desc&limit=20/);
    assert.equal(init.headers.apikey, 'sb_publishable_test');
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.cache, 'no-store');
    return Response.json([row]);
  });
  assert.deepEqual(await loadReviews(), [row]);
});

test('saves trimmed fields and uses the server-assigned record', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.method, 'POST');
    assert.match(_url, /\/rpc\/submit_review$/);
    assert.deepEqual(JSON.parse(init.body), { payload: { name: 'Sam', text: 'Lovely cookies', rating: 5 } });
    return Response.json([row], { status: 201 });
  });
  assert.deepEqual(await saveReview({ name: ' Sam ', text: ' Lovely cookies ', rating: 5 }), row);
});

test('rejects invalid input before making a request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('must not fetch'); });
  for (const input of [ { ...row, name: ' ' }, { ...row, name: 'x'.repeat(41) }, { ...row, text: 'x'.repeat(401) }, { ...row, rating: 6 }, { ...row, rating: 1.5 } ]) {
    await assert.rejects(saveReview(input), /Please enter/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('surfaces database failures and malformed responses', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }));
  await assert.rejects(saveReview(row), /Unable to access/);
  fetch.mock.mockImplementation(async () => Response.json([{ ...row, rating: 9 }]));
  await assert.rejects(loadReviews(), /Unexpected reviews/);
  fetch.mock.mockImplementation(async () => Response.json([]));
  await assert.rejects(saveReview(row), /Unexpected save/);
});


test('handles rate limits without exposing server details', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'private database detail' }, { status: 429 }));
  await assert.rejects(saveReview(row), /Too many reviews/);
});

test('does not forward attacker-controlled metadata', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.deepEqual(Object.keys(JSON.parse(init.body).payload).sort(), ['name', 'rating', 'text']);
    return Response.json([row]);
  });
  await saveReview({ ...row, approved: true, created_at: '2000-01-01' });
});

test('renders malicious review text as text, never HTML', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const attack = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const markup = renderToStaticMarkup(createElement('blockquote', null, attack));
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.ok(!markup.includes('<script>'));
  assert.ok(!markup.includes('<img'));
});

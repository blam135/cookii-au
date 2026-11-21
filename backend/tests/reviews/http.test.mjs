import assert from 'node:assert/strict';
import { test } from '../fixtures.mjs';
import { mock } from 'node:test';
import worker, { ReviewsStore } from '../../src/index.ts';
const env = {
  NOTION_TOKEN: 'secret',
  NOTION_DATA_SOURCE_ID: 'fixed-source',
  ALLOWED_ORIGIN: 'https://cookii.example',
  TURNSTILE_HOSTNAME: 'cookii.example',
  TURNSTILE_SECRET: 'secret',
  IP_HASH_SECRET: 'secret',
  SUBMISSIONS_ENABLED: 'true',
};
const input = {
  name: 'Sam',
  text: "<script>alert(1)</script> '); DROP TABLE reviews; --",
  rating: 5,
  turnstileToken: 'valid',
};
function setup() {
  const data = new Map();
  let queue = Promise.resolve();
  const ctx = {
    storage: {
      get: async (k) => structuredClone(data.get(k)),
      put: async (k, v) => data.set(k, structuredClone(v)),
    },
    blockConcurrencyWhile: (fn) => {
      const p = queue.then(fn);
      queue = p.catch(() => {});
      return p;
    },
  };
  const store = new ReviewsStore(ctx, env);
  return { data, store, ctx };
}
function request(method = 'POST', body = input, ip = '192.0.2.1') {
  return new Request('https://api.example/reviews', {
    method,
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ip,
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}
function mockFetch(
  challenge = { success: true, hostname: 'cookii.example', action: 'review' },
) {
  let creates = 0;
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/siteverify')) return Response.json(challenge);
    if (url.endsWith('/query')) return Response.json({ results: [] });
    assert.equal(url, 'https://api.notion.com/v1/pages');
    const body = JSON.parse(options.body);
    assert.equal(body.parent.data_source_id, 'fixed-source');
    assert.deepEqual(Object.keys(body.properties).sort(), [
      'Name',
      'Rating',
      'Review',
    ]);
    assert.equal(body.properties.Review.rich_text[0].text.content, input.text);
    creates++;
    return Response.json({ id: 'server-id', properties: body.properties });
  });
  return () => creates;
}
test('real handler writes injection strings as literal text and exposes only public fields', async () => {
  const count = mockFetch();
  const { store } = setup();
  const r = await store.fetch(request());
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), [
    { id: 'server-id', name: 'Sam', text: input.text, rating: 5 },
  ]);
  assert.equal(count(), 1);
});
test('strict limits, bad challenges and malformed payloads fail closed', async () => {
  const count = mockFetch({
    success: true,
    hostname: 'attacker.example',
    action: 'review',
  });
  const { store } = setup();
  assert.equal((await store.fetch(request())).status, 403);
  assert.equal(count(), 0);
  assert.equal(
    (await store.fetch(request('POST', { ...input, approved: true }))).status,
    400,
  );
  assert.equal(
    (await store.fetch(request('POST', { ...input, text: 'x'.repeat(5000) })))
      .status,
    400,
  );
  assert.equal(
    (await store.fetch(request('POST', { ...input, turnstileToken: '' })))
      .status,
    400,
  );
});
test('persistent quotas are atomic across concurrent requests and object recreation', async () => {
  const count = mockFetch();
  const { store, ctx, data } = setup();
  const result = await Promise.all(
    Array.from({ length: 8 }, () => store.fetch(request())),
  );
  assert.equal(result.filter((r) => r.status === 201).length, 3);
  assert.equal(count(), 3);
  assert.equal((await new ReviewsStore(ctx, env).fetch(request())).status, 429);
  const budget = data.get('budget');
  budget.submits = 100;
  data.set('budget', budget);
  assert.equal(
    (await store.fetch(request('POST', input, '192.0.2.2'))).status,
    429,
  );
});
test('failed verification consumes budget and never calls Notion', async () => {
  const count = mockFetch({ success: false });
  const { store, data } = setup();
  await store.fetch(request());
  assert.equal(data.get('budget').submits, 1);
  assert.equal(count(), 0);
});
test('persistent read cache bounds Notion calls and fails closed at daily read allowance', async () => {
  mockFetch();
  const { store, ctx, data } = setup();
  assert.equal((await store.fetch(request('GET'))).status, 200);
  assert.equal(
    (await new ReviewsStore(ctx, env).fetch(request('GET'))).status,
    200,
  );
  assert.equal(data.get('budget').reads, 1);
  const budget = data.get('budget');
  budget.reads = 1440;
  data.set('budget', budget);
  data.delete('cache');
  assert.equal((await store.fetch(request('GET'))).status, 429);
});
test('edge enforces kill switch, origin, method and missing configuration', async () => {
  assert.equal(
    (await worker.fetch(request(), { ...env, SUBMISSIONS_ENABLED: 'false' }))
      .status,
    503,
  );
  const r = request();
  r.headers.set('Origin', 'https://attacker.example');
  assert.equal((await worker.fetch(r, env)).status, 403);
  assert.equal((await worker.fetch(request(), {})).status, 503);
  assert.equal(
    (
      await worker.fetch(
        new Request('https://api.example/reviews', { method: 'DELETE' }),
        env,
      )
    ).status,
    405,
  );
});

test('create handler rejects malformed JSON and missing client IP before provider calls', async () => {
  mock.method(globalThis, 'fetch', async () => {
    assert.fail('Invalid submissions must not contact providers');
  });
  const { store, data } = setup();
  const malformed = new Request(request(), { body: '{' });
  const response = await store.fetch(malformed);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Invalid review.' });
  const missingIp = request();
  missingIp.headers.delete('CF-Connecting-IP');
  assert.equal((await store.fetch(missingIp)).status, 403);
  assert.equal(data.has('budget'), false);
});

test('read and write handlers return generic errors when providers fail', async () => {
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('Private upstream failure details');
  });
  for (const method of ['GET', 'POST']) {
    const { store } = setup();
    const response = await store.fetch(request(method));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      message: 'Reviews temporarily unavailable.',
    });
  }
});

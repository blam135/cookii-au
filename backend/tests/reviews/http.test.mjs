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
  mock.method(console, 'error', () => {});
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

test('Notion rejection logs only its status and a fixed event name', async () => {
  const logs = [];
  mock.method(console, 'error', (...args) => logs.push(args));
  mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: 'Private upstream details' }, { status: 401 }),
  );
  const { store } = setup();
  const response = await store.fetch(request('GET'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: 'Reviews temporarily unavailable.',
  });
  assert.deepEqual(logs, [
    [
      {
        event: 'notion_request_failed',
        operation: 'query',
        status: 401,
        code: 'unknown',
        durationMs: logs[0][0].durationMs,
        requestId: logs[0][0].requestId,
      },
    ],
    [{ event: 'reviews_read_failed', requestId: logs[0][0].requestId }],
  ]);
});

test('transport failures log fixed events without exception details', async () => {
  const logs = [];
  mock.method(console, 'error', (...args) => logs.push(args));
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('Private exception including credentials');
  });
  const { store } = setup();
  assert.equal((await store.fetch(request('GET'))).status, 503);
  assert.deepEqual(logs, [
    [
      {
        event: 'notion_transport_failed',
        operation: 'query',
        reason: 'other',
        durationMs: logs[0][0].durationMs,
        requestId: logs[0][0].requestId,
      },
    ],
    [{ event: 'reviews_read_failed', requestId: logs[0][0].requestId }],
  ]);
});

function captureDiagnostics() {
  const logs = [];
  for (const method of ['info', 'error'])
    mock.method(console, method, (...args) => {
      assert.equal(args.length, 1);
      const entry = args[0];
      assert.match(entry.requestId, /^[0-9a-f-]{36}$/);
      logs.push(entry);
    });
  return logs;
}

function assertPrivate(logs) {
  const output = JSON.stringify(logs);
  for (const value of [
    env.NOTION_TOKEN,
    env.NOTION_DATA_SOURCE_ID,
    '192.0.2.1',
    input.name,
    input.text,
    'private-diagnostic-marker',
  ])
    assert.equal(
      output.includes(value),
      false,
      `Log contains private value: ${value}`,
    );
}

function edgeEnvironment(store) {
  return { ...env, REVIEWS: { idFromName: () => 'object', get: () => store } };
}

test('request IDs correlate Worker and object logs and replace client IDs', async () => {
  const logs = captureDiagnostics();
  mockFetch();
  const { store } = setup();
  const clientId = '12345678-1234-4123-8123-123456789abc';
  const r = new Request(
    'https://api.example/reviews?private-diagnostic-marker',
    request('GET'),
  );
  r.headers.set('X-Reviews-Request-Id', clientId);
  const response = await worker.fetch(r, edgeEnvironment(store));
  assert.equal(response.status, 200);
  const id = response.headers.get('X-Request-Id');
  assert.notEqual(id, clientId);
  assert.ok(logs.length >= 4);
  assert.ok(logs.every((entry) => entry.requestId === id));
  assert.equal(
    logs.find((entry) => entry.event === 'notion_request_completed').operation,
    'query',
  );
  assert.equal(logs.at(-1).event, 'reviews_request_completed');
  assert.equal(logs.at(-1).status, 200);
  assert.ok(logs.at(-1).durationMs >= 0);
  logs.length = 0;
  const cached = await worker.fetch(request('GET'), edgeEnvironment(store));
  assert.notEqual(cached.headers.get('X-Request-Id'), id);
  assert.ok(
    logs.every(
      (entry) => entry.requestId === cached.headers.get('X-Request-Id'),
    ),
  );
  assert.equal(
    logs.find((entry) => entry.event === 'reviews_cache_checked').state,
    'fresh',
  );
  assert.equal(
    logs.some((entry) => entry.event.startsWith('notion_')),
    false,
  );
  assertPrivate(logs);
});

test('configuration diagnostics contain missing setting names without values', async () => {
  const logs = captureDiagnostics();
  const response = await worker.fetch(request('GET'), {
    ...env,
    NOTION_TOKEN: '',
    IP_HASH_SECRET: '',
  });
  assert.equal(response.status, 503);
  assert.deepEqual(logs[0].missing, ['NOTION_TOKEN', 'IP_HASH_SECRET']);
  assert.equal(logs[0].event, 'reviews_configuration_missing');
  assertPrivate(logs);
});

for (const [operation, key] of [
  ['get', 'cache'],
  ['get', 'budget'],
  ['put', 'budget'],
  ['put', 'cache'],
]) {
  test(`storage diagnostics distinguish ${operation} ${key} failures`, async () => {
    const logs = captureDiagnostics();
    mockFetch();
    const { store, ctx } = setup();
    const original = ctx.storage[operation];
    ctx.storage[operation] = async (storageKey, ...args) => {
      if (storageKey === key) throw new Error('private-diagnostic-marker');
      return original(storageKey, ...args);
    };
    const response = await worker.fetch(request('GET'), edgeEnvironment(store));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      message: 'Reviews temporarily unavailable.',
    });
    assert.deepEqual(
      logs.find((entry) => entry.event === 'reviews_storage_failed'),
      {
        event: 'reviews_storage_failed',
        operation,
        key,
        reason: 'other',
        requestId: response.headers.get('X-Request-Id'),
      },
    );
    assertPrivate(logs);
  });
}

test('missing bindings, dispatch errors and object boundary failures have distinct events', async () => {
  const logs = captureDiagnostics();
  assert.equal((await worker.fetch(request('GET'), env)).status, 503);
  assert.ok(logs.some((entry) => entry.event === 'reviews_binding_missing'));
  logs.length = 0;
  const store = {
    fetch: async () => {
      throw new Error('private-diagnostic-marker');
    },
  };
  assert.equal(
    (await worker.fetch(request('GET'), edgeEnvironment(store))).status,
    503,
  );
  assert.ok(logs.some((entry) => entry.event === 'reviews_dispatch_failed'));
  logs.length = 0;
  const { store: broken, ctx } = setup();
  ctx.blockConcurrencyWhile = () =>
    Promise.reject(new Error('private-diagnostic-marker'));
  assert.equal(
    (await worker.fetch(request('GET'), edgeEnvironment(broken))).status,
    503,
  );
  assert.ok(logs.some((entry) => entry.event === 'reviews_store_failed'));
  assertPrivate(logs);
});

for (const [reason, body] of [
  ['json', 'private-diagnostic-marker'],
  ['results', '{}'],
  ['page', '{"results":[null]}'],
]) {
  test(`Notion successful HTTP response reports invalid ${reason} without its body`, async () => {
    const logs = captureDiagnostics();
    mock.method(globalThis, 'fetch', async () => new Response(body));
    const { store } = setup();
    assert.equal((await store.fetch(request('GET'))).status, 503);
    const entry = logs.find(
      (entry) => entry.event === 'notion_response_invalid',
    );
    assert.equal(entry.operation, 'query');
    assert.equal(entry.reason, reason);
    assertPrivate(logs);
  });
}

test('Notion error codes are allowlisted and transport timeouts are categorized', async () => {
  const logs = captureDiagnostics();
  for (const code of ['validation_error', 'private-diagnostic-marker']) {
    mock.method(globalThis, 'fetch', async () =>
      Response.json(
        { code, message: 'private-diagnostic-marker' },
        { status: 400 },
      ),
    );
    const { store } = setup();
    assert.equal((await store.fetch(request('GET'))).status, 503);
    assert.equal(
      logs.findLast((entry) => entry.event === 'notion_request_failed').code,
      code === 'validation_error' ? code : 'unknown',
    );
  }
  mock.method(globalThis, 'fetch', async () => {
    throw new DOMException('private-diagnostic-marker', 'TimeoutError');
  });
  const { store } = setup();
  assert.equal((await store.fetch(request('GET'))).status, 503);
  assert.equal(
    logs.find((entry) => entry.event === 'notion_transport_failed').reason,
    'timeout',
  );
  assertPrivate(logs);
});

test('Notion mapping reports skipped rows without page IDs, properties or review contents', async () => {
  const logs = captureDiagnostics();
  mock.method(globalThis, 'fetch', async () =>
    Response.json({
      results: [
        { id: 'private-diagnostic-marker', properties: {} },
        {
          id: 'private-diagnostic-marker',
          properties: {
            Name: { title: [{ plain_text: input.name }] },
            Rating: { number: input.rating },
            Review: { rich_text: [{ plain_text: input.text }] },
          },
        },
      ],
    }),
  );
  const { store } = setup();
  assert.equal((await store.fetch(request('GET'))).status, 200);
  const summary = logs.find((entry) => entry.event === 'notion_reviews_loaded');
  assert.equal(summary.rows, 1);
  assert.equal(summary.skipped, 1);
  assertPrivate(logs);
});

test('concurrent requests keep separate IDs across serialized object operations', async () => {
  const logs = captureDiagnostics();
  mockFetch();
  const { store } = setup();
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      worker.fetch(request(), edgeEnvironment(store)),
    ),
  );
  const ids = responses.map((response) => response.headers.get('X-Request-Id'));
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) {
    assert.ok(
      logs.some(
        (entry) =>
          entry.requestId === id &&
          entry.event === 'notion_request_completed' &&
          entry.operation === 'create',
      ),
    );
    assert.ok(
      logs.some(
        (entry) =>
          entry.requestId === id &&
          entry.event === 'reviews_request_completed' &&
          entry.status === 201,
      ),
    );
  }
  assertPrivate(logs);
});

test('Turnstile diagnostics exclude submitted tokens, IPs and upstream details', async () => {
  const logs = captureDiagnostics();
  for (const reason of ['hostname', 'http', 'json', 'timeout']) {
    mock.method(globalThis, 'fetch', async () => {
      if (reason === 'timeout')
        throw new DOMException('private-diagnostic-marker', 'TimeoutError');
      if (reason === 'json') return new Response('private-diagnostic-marker');
      if (reason === 'http')
        return Response.json(
          { message: 'private-diagnostic-marker' },
          { status: 502 },
        );
      return Response.json({
        success: true,
        hostname: 'private-diagnostic-marker',
        action: 'review',
      });
    });
    const { store } = setup();
    const response = await store.fetch(
      request('POST', {
        ...input,
        turnstileToken: 'private-diagnostic-marker',
      }),
    );
    assert.equal(response.status, reason === 'hostname' ? 403 : 503);
    assert.equal(
      logs.findLast((entry) => entry.event.startsWith('turnstile_')).reason,
      reason,
    );
  }
  assertPrivate(logs);
});

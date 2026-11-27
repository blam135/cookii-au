import assert from 'node:assert/strict';
import { test } from '../fixtures.mjs';
import { mock } from 'node:test';
import worker, { ReviewsStore } from '../../src/index.ts';
const env = {
  REVIEW_READ_LIMITER: { limit: async () => ({ success: true }) },
  REVIEW_WRITE_LIMITER: { limit: async () => ({ success: true }) },
  NOTION_TOKEN: 'test-private-notion-token',
  NOTION_DATA_SOURCE_ID: 'fixed-source',
  ALLOWED_ORIGIN: 'https://cookii.example',
  TURNSTILE_HOSTNAME: 'cookii.example',
  TURNSTILE_SECRET: 'test-private-turnstile-key',
  IP_HASH_SECRET: 'test-private-ip-hash-key',
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
    413,
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
test('failed verification consumes attempt budget but preserves verified submission allowance', async () => {
  const count = mockFetch({ success: false });
  const { store, data } = setup();
  await store.fetch(request());
  assert.equal(data.get('budget').submits, 0);
  assert.equal(data.get('budget').attempts, 1);
  assert.equal(count(), 0);
});
test('legacy cached rows and read intervals cannot mask fresh reads or exhausted quotas', async () => {
  const now = Date.UTC(2026, 10, 27, 12);
  mock.method(Date, 'now', () => now);
  const { store, ctx, data } = setup();
  data.set('cache', {
    expires: now + 60000,
    rows: [{ id: 'deleted', name: 'Sam', rating: 5, text: 'Removed review' }],
  });
  data.set('budget', {
    day: Math.floor(now / 86400000),
    reads: 1438,
    nextRead: now + 60000,
    submits: 0,
    ips: {},
  });
  const query = mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(url.endsWith('/query'));
    return Response.json({ results: [] });
  });
  for (const object of [store, new ReviewsStore(ctx, env)]) {
    const response = await object.fetch(request('GET'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  }
  assert.equal(data.get('budget').reads, 1440);
  const limited = await store.fetch(request('GET'));
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {});
  assert.equal(query.mock.callCount(), 2);
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
  const malformed = new Request(request(), { method: 'POST', body: '{' });
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
    env.TURNSTILE_SECRET,
    env.IP_HASH_SECRET,
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
  assert.ok(logs.every((entry) => entry.requestId === id));
  assert.equal(
    logs.find((entry) => entry.event === 'notion_request_completed').operation,
    'query',
  );
  assert.equal(logs.at(-1).event, 'reviews_request_completed');
  assert.equal(logs.at(-1).status, 200);
  assert.ok(logs.at(-1).durationMs >= 0);
  logs.length = 0;
  const next = await worker.fetch(request('GET'), edgeEnvironment(store));
  assert.equal(next.status, 200);
  const nextId = next.headers.get('X-Request-Id');
  assert.notEqual(nextId, id);
  assert.ok(logs.every((entry) => entry.requestId === nextId));
  assert.equal(
    logs.find((entry) => entry.event === 'notion_request_completed').operation,
    'query',
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

for (const operation of ['get', 'put']) {
  const key = 'budget';
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
    Array.from({ length: 3 }, async () =>
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

for (const { name, codes, expected } of [
  {
    name: 'expired or reused token',
    codes: ['timeout-or-duplicate', 'timeout-or-duplicate'],
    expected: ['timeout-or-duplicate'],
  },
  {
    name: 'invalid secret',
    codes: ['invalid-input-secret'],
    expected: ['invalid-input-secret'],
  },
  {
    name: 'upstream details mixed with a known error',
    codes: [
      'internal-error',
      'private-diagnostic-marker',
      { token: 'private-diagnostic-marker' },
    ],
    expected: ['internal-error', 'unknown'],
  },
  { name: 'missing codes', codes: undefined, expected: ['unknown'] },
  { name: 'empty codes', codes: [], expected: ['unknown'] },
  {
    name: 'malformed codes',
    codes: 'private-diagnostic-marker',
    expected: ['unknown'],
  },
]) {
  test(`Turnstile challenge diagnostics safely identify ${name}`, async () => {
    const logs = captureDiagnostics();
    const creates = mockFetch({
      success: false,
      'error-codes': codes,
      message: 'private-diagnostic-marker',
    });
    const { store, data } = setup();
    const response = await store.fetch(
      request('POST', {
        ...input,
        turnstileToken: 'private-diagnostic-marker',
      }),
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      message: 'Please complete the verification again.',
    });
    const rejection = logs.find(
      (entry) => entry.event === 'turnstile_rejected',
    );
    assert.equal(rejection.reason, 'challenge');
    assert.deepEqual(rejection.codes, expected);
    assert.equal(creates(), 0);
    assert.equal(data.get('budget').attempts, 1);
    assert.equal(data.get('budget').submits, 0);
    assertPrivate(logs);
  });
}

for (const challenge of [
  { success: false, hostname: 'cookii.example', action: 'review' },
  { success: true, hostname: 'cookii.example', action: 'login' },
  { success: true, hostname: 'other.example', action: 'review' },
]) {
  test(`challenge rejection preserves daily submission quota: ${JSON.stringify(challenge)}`, async () => {
    const count = mockFetch(challenge);
    const { store, data } = setup();
    for (let i = 0; i < 4; i++)
      assert.equal((await store.fetch(request())).status, i < 3 ? 403 : 429);
    assert.equal(count(), 0);
    assert.equal(data.get('budget').submits, 0);
    assert.equal(data.get('budget').attempts, 3);
  });
}

test('distributed invalid challenges do not exhaust the verified daily quota', async () => {
  mockFetch({ success: false });
  const { store, data } = setup();
  for (let i = 1; i <= 101; i++)
    assert.equal(
      (await store.fetch(request('POST', input, `192.0.2.${i}`))).status,
      403,
    );
  assert.equal(data.get('budget').submits, 0);
  const count = mockFetch();
  assert.equal(
    (await store.fetch(request('POST', input, '192.0.2.200'))).status,
    201,
  );
  assert.equal(count(), 1);
  assert.equal(data.get('budget').submits, 1);
});

test('hard verification-attempt cap bounds external work independently of saved reviews', async () => {
  const count = mockFetch();
  const { store, data } = setup();
  data.set('budget', {
    day: Math.floor(Date.now() / 86400000),
    attempts: 1000,
    submits: 0,
    reads: 0,
    ips: {},
  });
  assert.equal((await store.fetch(request())).status, 429);
  assert.equal(count(), 0);
});

for (const method of ['GET', 'POST']) {
  test(`edge blocks excessive ${method} requests before object dispatch`, async () => {
    const binding =
      method === 'GET' ? 'REVIEW_READ_LIMITER' : 'REVIEW_WRITE_LIMITER';
    let checks = 0;
    const edge = edgeEnvironment({
      fetch: () => assert.fail('Must not dispatch blocked traffic'),
    });
    edge[binding] = {
      limit: async ({ key }) => {
        checks++;
        assert.equal(key, '192.0.2.1');
        return { success: false };
      },
    };
    const response = await worker.fetch(request(method), edge);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '60');
    assert.equal(checks, 1);
    edge[binding] = undefined;
    assert.equal((await worker.fetch(request(method), edge)).status, 503);
  });
}

test('security headers are present on successful and rejected API responses', async () => {
  mockFetch();
  const { store } = setup();
  for (const req of [
    request('GET'),
    new Request('https://api.example/missing'),
    request('POST', { ...input, rating: 99 }),
  ]) {
    const response = await worker.fetch(req, edgeEnvironment(store));
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(
      response.headers.get('Strict-Transport-Security'),
      'max-age=31536000',
    );
    assert.match(
      response.headers.get('Content-Security-Policy'),
      /frame-ancestors 'none'/,
    );
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

/** @type {Array<[string, Record<string, string>, number]>} */
const invalidRequestCases = [
  ['{', {}, 400],
  ['{}', { 'Content-Type': 'text/plain' }, 415],
  ['{}', { 'Content-Encoding': 'gzip' }, 415],
  [JSON.stringify({ ...input, text: 'x'.repeat(5000) }), {}, 413],
  [JSON.stringify({ ...input, rating: { $gt: 0 } }), {}, 400],
  [JSON.stringify({ ...input, approved: true }), {}, 400],
  [
    '{"__proto__":{"polluted":true},"name":"Sam","rating":5,"text":"test","turnstileToken":"valid"}',
    {},
    400,
  ],
];
for (const [
  caseIndex,
  [body, headers, status],
] of invalidRequestCases.entries()) {
  test(`invalid request is rejected before shared object dispatch: case ${caseIndex} ${status} ${JSON.stringify(headers)} ${body.slice(0, 30)}`, async () => {
    const edge = edgeEnvironment({
      fetch: () => assert.fail('Invalid request reached shared object'),
    });
    const req = new Request(request(), { method: 'POST', body });
    for (const [name, value] of Object.entries(headers))
      req.headers.set(name, value);
    const response = await worker.fetch(req, edge);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal({}.polluted, undefined);
  });
}

test('a slow upload does not prevent another request reaching the shared object', async () => {
  const abort = new AbortController();
  let dispatched = 0;
  const edge = edgeEnvironment({
    fetch: async (req) => {
      dispatched++;
      assert.equal(req.method, 'GET');
      return Response.json([]);
    },
  });
  const slow = worker.fetch(
    new Request('https://api.example/reviews', {
      method: 'POST',
      headers: request().headers,
      body: new ReadableStream(),
      duplex: 'half',
      signal: abort.signal,
    }),
    edge,
  );
  try {
    assert.equal((await worker.fetch(request('GET'), edge)).status, 200);
    assert.equal(dispatched, 1);
  } finally {
    abort.abort();
  }
  assert.equal((await slow).status, 400);
  assert.equal(dispatched, 1);
});

for (const [method, path, expected] of [
  ['GET', '/reviews/', 404],
  ['GET', '/%72eviews', 404],
  ['GET', '/missing', 404],
  ['OPTIONS', '/missing', 404],
  ['OPTIONS', '/reviews', 204],
  ['HEAD', '/reviews', 405],
  ['PUT', '/reviews', 405],
  ['PATCH', '/reviews', 405],
  ['DELETE', '/reviews', 405],
]) {
  test(`Hono preserves exact routing: ${method} ${path} returns ${expected}`, async () => {
    const edge = edgeEnvironment({
      fetch: () => assert.fail('Rejected route reached object'),
    });
    const response = await worker.fetch(
      new Request(`https://api.example${path}`, { method }),
      edge,
    );
    assert.equal(response.status, expected);
    assert.equal(
      response.headers.get('Access-Control-Allow-Origin'),
      env.ALLOWED_ORIGIN,
    );
    assert.equal(
      response.headers.get('Access-Control-Allow-Methods'),
      'GET,POST,OPTIONS',
    );
    assert.equal(
      response.headers.get('Access-Control-Allow-Headers'),
      'Content-Type',
    );
    assert.equal(response.headers.get('Vary'), 'Origin');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(
      response.headers.get('Strict-Transport-Security'),
      'max-age=31536000',
    );
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(
      response.headers.get('Permissions-Policy'),
      'camera=(), microphone=(), geolocation=()',
    );
    assert.equal(
      response.headers.get('Content-Security-Policy'),
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    assert.match(response.headers.get('X-Request-Id'), /^[0-9a-f-]{36}$/);
  });
}

test('Hono error boundary retains generic responses, headers and private diagnostics', async () => {
  const logs = captureDiagnostics();
  const edge = edgeEnvironment({
    fetch: () => {
      throw new Error('private-diagnostic-marker');
    },
  });
  const response = await worker.fetch(request('GET'), edge);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: 'Reviews temporarily unavailable.',
  });
  assert.equal(
    response.headers.get('Access-Control-Allow-Origin'),
    env.ALLOWED_ORIGIN,
  );
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.match(
    response.headers.get('Content-Security-Policy'),
    /frame-ancestors 'none'/,
  );
  assert.ok(logs.some((entry) => entry.event === 'reviews_route_failed'));
  assertPrivate(logs);
});

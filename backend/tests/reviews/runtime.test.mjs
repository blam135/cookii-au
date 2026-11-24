import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { test } from '../fixtures.mjs';

const env = {
  NOTION_TOKEN: 'test',
  NOTION_DATA_SOURCE_ID: 'test',
  ALLOWED_ORIGIN: 'https://cookii.example',
  TURNSTILE_HOSTNAME: 'cookii.example',
  TURNSTILE_SECRET: 'test',
  IP_HASH_SECRET: 'test',
  SUBMISSIONS_ENABLED: 'true',
};
const input = {
  name: 'Sam',
  rating: 5,
  text: 'Test review',
  turnstileToken: 'test',
};
let script;

test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: [
      fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  script = bundle.outputFiles[0].text;
});

function runtime(outboundService) {
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-11-21',
      script,
      bindings: env,
      ratelimits: {
        REVIEW_READ_LIMITER: {
          namespace_id: '71001',
          simple: { limit: 60, period: 60 },
        },
        REVIEW_WRITE_LIMITER: {
          namespace_id: '71002',
          simple: { limit: 10, period: 60 },
        },
      },
      durableObjects: {
        REVIEWS: { className: 'ReviewsStore', useSQLite: true },
      },
      // Intercept every external request: no live Notion or Turnstile access.
      outboundService,
    }),
  );
}

function submit(mf) {
  return mf.dispatchFetch('https://api.example/reviews', {
    method: 'POST',
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.1',
    },
    body: JSON.stringify(input),
  });
}

test('Worker runtime reads, verifies, creates and serves updated cached reviews', async () => {
  const calls = [];
  const mf = runtime(async (request) => {
    calls.push(request.url);
    const url = new URL(request.url);
    if (url.hostname === 'challenges.cloudflare.com')
      return Response.json({
        success: true,
        hostname: env.TURNSTILE_HOSTNAME,
        action: 'review',
      });
    assert.equal(url.hostname, 'api.notion.com');
    if (url.pathname.endsWith('/query')) return Response.json({ results: [] });
    assert.equal(url.pathname, '/v1/pages');
    const body = await request.json();
    return Response.json({ id: 'test-review', properties: body.properties });
  });
  try {
    const first = await mf.dispatchFetch('https://api.example/reviews');
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), []);
    const created = await submit(mf);
    assert.equal(created.status, 201);
    const rows = await created.json();
    assert.deepEqual(rows, [
      {
        id: 'test-review',
        name: input.name,
        rating: input.rating,
        text: input.text,
      },
    ]);
    const cached = await mf.dispatchFetch('https://api.example/reviews');
    assert.equal(cached.status, 200);
    assert.deepEqual(await cached.json(), rows);
    assert.equal(calls.length, 3);
    assert.equal(calls.filter((url) => url.endsWith('/query')).length, 1);
  } finally {
    await mf.dispose();
  }
});

for (const provider of ['Notion', 'Turnstile']) {
  test(`Worker runtime rejects ${provider} redirects without following them`, async () => {
    const calls = [];
    const mf = runtime(async (request) => {
      calls.push(request.url);
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://unexpected.example' },
      });
    });
    try {
      const response =
        provider === 'Notion'
          ? await mf.dispatchFetch('https://api.example/reviews')
          : await submit(mf);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        message: 'Reviews temporarily unavailable.',
      });
      assert.equal(calls.length, 1);
      assert.equal(
        new URL(calls[0]).hostname,
        provider === 'Notion' ? 'api.notion.com' : 'challenges.cloudflare.com',
      );
    } finally {
      await mf.dispose();
    }
  });
}

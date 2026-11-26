import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { test } from '../fixtures.mjs';
import { NotionReviewRepository } from '../../src/reviews/adapters/notion.ts';

const env = {
  NOTION_TOKEN: 'test-token',
  NOTION_DATA_SOURCE_ID: 'test-source',
};
const input = { name: 'Sam', rating: 5, text: 'Lovely cookies' };

for (const method of ['load', 'save']) {
  for (const status of [429, 529]) {
    test(`Notion ${method} does not retry ${status} responses or log SDK details`, async () => {
      let calls = 0;
      const logs = [];
      for (const level of ['info', 'warn', 'error'])
        mock.method(console, level, (...args) => logs.push(args));
      const repository = new NotionReviewRepository(
        env,
        async (url, options) => {
          calls++;
          const headers = new Headers(options.headers);
          assert.equal(headers.get('Authorization'), 'Bearer test-token');
          assert.equal(headers.get('Notion-Version'), '2025-09-03');
          assert.equal(options.redirect, 'manual');
          assert.ok(options.signal instanceof AbortSignal);
          return Response.json(
            {
              code: status === 429 ? 'rate_limited' : 'service_overload',
              message: 'private-sdk-detail',
            },
            { status, headers: { 'Retry-After': '0' } },
          );
        },
      );
      await assert.rejects(repository[method](input), /Notion unavailable/);
      assert.equal(calls, 1);
      assert.ok(!JSON.stringify(logs).includes('private-sdk-detail'));
      assert.ok(!JSON.stringify(logs).includes('test-token'));
    });
  }
}

for (const phase of ['headers', 'body']) {
  test(`Notion deadline aborts a stalled response ${phase}`, async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    mock.method(AbortSignal, 'timeout', (milliseconds) => {
      assert.equal(milliseconds, 8000);
      return timeout(20);
    });
    const repository = new NotionReviewRepository(
      env,
      async (_url, { signal }) => {
        if (phase === 'headers')
          return new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            }),
          );
        return new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener(
                'abort',
                () => controller.error(signal.reason),
                { once: true },
              );
            },
          }),
        );
      },
    );
    await assert.rejects(repository.load(), /Notion unavailable/);
  });
}

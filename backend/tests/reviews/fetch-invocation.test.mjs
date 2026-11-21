import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { test } from '../fixtures.mjs';
import { NotionReviewRepository } from '../../src/reviews/adapters/notion.ts';
import { TurnstileVerifier } from '../../src/reviews/adapters/turnstile.ts';

for (const injected of [false, true]) {
  test(`adapters call ${injected ? 'injected' : 'global'} fetch without a class receiver`, async () => {
    const calls = [];
    // Node fetch and arrow mocks accept receivers that Workers fetch rejects.
    async function receiverCheckedFetch(url, options) {
      assert.ok(this === undefined || this === globalThis);
      calls.push(url);
      if (url.endsWith('/query')) return Response.json({ results: [] });
      if (url.endsWith('/pages'))
        return Response.json({
          id: 'review-id',
          properties: JSON.parse(options.body).properties,
        });
      return Response.json({
        success: true,
        hostname: 'cookii.example',
        action: 'review',
      });
    }
    mock.method(globalThis, 'fetch', receiverCheckedFetch);
    const fetcher = injected ? receiverCheckedFetch : undefined;
    const repository = new NotionReviewRepository(
      { NOTION_TOKEN: 'test', NOTION_DATA_SOURCE_ID: 'test' },
      fetcher,
    );
    const verifier = new TurnstileVerifier(
      { TURNSTILE_SECRET: 'test', TURNSTILE_HOSTNAME: 'cookii.example' },
      fetcher,
    );
    assert.deepEqual(await repository.load(), []);
    const input = { name: 'Sam', rating: 5, text: 'Delicious cookies!' };
    assert.deepEqual(await repository.save(input), [
      { id: 'review-id', ...input },
    ]);
    assert.equal(await verifier.verify('test', '192.0.2.1'), true);
    assert.equal(calls.length, 3);
  });
}

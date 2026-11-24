import assert from 'node:assert/strict';
import { test } from '../fixtures.mjs';
import { NotionReviewRepository } from '../../src/reviews/adapters/notion.ts';
import { injectionPayloads } from '../../../tests/fixtures/injection-payloads.mjs';

for (const { name, text } of injectionPayloads) {
  test(`Notion adapter keeps ${name} in a literal text field`, async () => {
    let calls = 0;
    const repo = new NotionReviewRepository(
      { NOTION_TOKEN: 'test-secret', NOTION_DATA_SOURCE_ID: 'fixed-source' },
      async (url, options) => {
        calls++;
        assert.equal(url, 'https://api.notion.com/v1/pages');
        assert.equal(options.redirect, 'manual');
        const body = JSON.parse(options.body);
        assert.equal(body.parent.data_source_id, 'fixed-source');
        assert.deepEqual(Object.keys(body.properties).sort(), [
          'Name',
          'Rating',
          'Review',
        ]);
        assert.deepEqual(body.properties.Review, {
          rich_text: [{ text: { content: text } }],
        });
        return Response.json({ id: 'created', properties: body.properties });
      },
    );
    const rows = await repo.save({ name: "O'Brien", text, rating: 5 });
    assert.deepEqual(rows, [
      { id: 'created', name: "O'Brien", text, rating: 5 },
    ]);
    assert.equal(calls, 1);
  });
}

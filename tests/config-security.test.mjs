import assert from 'node:assert/strict';
import { test } from './fixtures.mjs';
import { spawnSync } from 'node:child_process';

test('build accepts HTTPS base URLs and rejects endpoint paths or unsafe URLs', () => {
  for (const [url, valid] of [
    ['https://example.com', true],
    ['https://example.com/', true],
    ['https://example.com/reviews', false],
    ['http://example.com/reviews', false],
    ['https://user:secret@example.com/reviews', false],
    ['https://example.com/reviews?token=secret', false],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['-e', "import('./next.config.ts')"],
      {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, NEXT_PUBLIC_REVIEWS_API_URL: url },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status === 0, valid);
  }
});

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from './fixtures.mjs';
import { checkExportSecrets } from '../scripts/check-export-secrets.mjs';

test('export refuses private credentials without including them in diagnostics', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cookii-export-test-'));
  const secret = 'test-only-private-credential/with+symbols';
  try {
    await mkdir(path.join(directory, '_next'));
    const filename = path.join(directory, '_next', 'bundle.js');
    for (const value of [
      secret,
      encodeURIComponent(secret),
      Buffer.from(secret).toString('base64'),
    ]) {
      await writeFile(filename, JSON.stringify({ accidental: value }));
      await assert.rejects(
        checkExportSecrets(directory, { NOTION_TOKEN: secret }),
        (error) => {
          assert.match(error.message, /Private credential detected/);
          assert.equal(error.message.includes(secret), false);
          assert.equal(error.message.includes(value), false);
          return true;
        },
      );
    }
    await writeFile(filename, 'const sitekey = "public-site-key";');
    await checkExportSecrets(directory, { NOTION_TOKEN: secret });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

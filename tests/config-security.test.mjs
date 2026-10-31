import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

function check(key, url = 'https://example.supabase.co') {
  return spawnSync(process.execPath, ['-e', "import('./next.config.ts')"], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, NEXT_PUBLIC_SUPABASE_URL: url },
    encoding: 'utf8',
  });
}
test('build rejects privileged keys and insecure database URLs', () => {
  assert.equal(check('sb_publishable_test').status, 0);
  assert.notEqual(check('sb_secret_test').status, 0);
  const privileged = `eyJ.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.notEqual(check(privileged).status, 0);
  assert.notEqual(check('sb_publishable_test', 'http://example.com').status, 0);
});

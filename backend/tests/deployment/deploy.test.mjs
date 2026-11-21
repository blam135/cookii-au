import assert from 'node:assert/strict';
import { test } from '../fixtures.mjs';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { deploy, deploymentConfig } from '../../scripts/deploy.ts';
const env = {
  CLOUDFLARE_API_TOKEN: 'test-token',
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  ALLOWED_ORIGIN: 'https://cookii.test',
  TURNSTILE_HOSTNAME: 'cookii.test',
  NOTION_DATA_SOURCE_ID: 'b'.repeat(32),
  NOTION_TOKEN: 'notion-secret',
  TURNSTILE_SECRET: 'turnstile-secret',
  IP_HASH_SECRET: 'x'.repeat(32),
};
test('deployment fails closed on missing or unsafe configuration', () => {
  assert.equal(deploymentConfig(env).vars.SUBMISSIONS_ENABLED, 'false');
  for (const [name, value] of [
    ['NOTION_TOKEN', ''],
    ['ALLOWED_ORIGIN', 'http://cookii.test'],
    ['TURNSTILE_HOSTNAME', 'wrong.test'],
    ['SUBMISSIONS_ENABLED', 'yes'],
    ['IP_HASH_SECRET', 'short'],
  ])
    assert.throws(() => deploymentConfig({ ...env, [name]: value }));
});
test('deploys vars and secrets together without secret arguments and cleans temporary files', () => {
  let file;
  deploy(env, (_command, args, options) => {
    file = args[args.indexOf('--secrets-file') + 1];
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(file)).NOTION_TOKEN, env.NOTION_TOKEN);
    assert.ok(!args.includes(env.NOTION_TOKEN));
    assert.ok(args.includes('SUBMISSIONS_ENABLED:false'));
    assert.equal(options.env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_API_TOKEN);
    return { status: 0 };
  });
  assert.equal(existsSync(file), false);
});
test('failed deployments clean secret files and report failure', () => {
  let file;
  assert.throws(() =>
    deploy(env, (_command, args) => {
      file = args[args.indexOf('--secrets-file') + 1];
      return { status: 1 };
    }),
  );
  assert.equal(existsSync(file), false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { secureHtml } from '../scripts/secure-export.mjs';

test('export CSP permits exact hydration scripts but denies arbitrary inline scripts', () => {
  const script = 'self.__next_f.push([1,"hello"])';
  const output = secureHtml(`<html><head><script>${script}</script><script src="/_next/a.js"></script></head></html>`, 'https://example.supabase.co');
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(output.includes(`script-src 'self' 'sha256-${hash}'`));
  assert.ok(output.indexOf('Content-Security-Policy') < output.indexOf('<script>'));
  assert.ok(output.includes("script-src-attr 'none'"));
  assert.ok(output.includes("object-src 'none'"));
  assert.ok(!output.includes("script-src 'self' 'unsafe-inline'"));
  assert.throws(() => secureHtml('<head>', 'https://example.com; unsafe'), /Invalid CSP/);
});

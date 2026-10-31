// Non-destructive live checks: malformed RPC input and writes matching no records.
// Run: node --env-file=.env.local tests/reviews-api.mjs
import assert from 'node:assert/strict';
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(base?.startsWith('https://') && key, 'Supabase environment required');
const headers = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
for (const [label, path, method, body, allowed] of [
  ['Public read', 'reviews?select=id&limit=1', 'GET', undefined, [200]],
  ['Invalid RPC input', 'rpc/submit_review', 'POST', { payload: { name: 'invalid', text: 'invalid', rating: 6 } }, [400]],
  ['Mass assignment', 'rpc/submit_review', 'POST', { payload: { name: 'invalid', text: 'invalid', rating: 5, approved: true } }, [400]],
  ['Direct insert denied', 'reviews', 'POST', {}, [401, 403]],
  ['Direct update denied', 'reviews?id=eq.00000000-0000-0000-0000-000000000000', 'PATCH', { text: 'Forbidden' }, [401, 403]],
  ['Direct delete denied', 'reviews?id=eq.00000000-0000-0000-0000-000000000000', 'DELETE', undefined, [401, 403]],
]) {
  const response = await fetch(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  assert.ok(allowed.includes(response.status), `${label}: unexpected HTTP ${response.status}`);
  console.log(`${label}: HTTP ${response.status} (pass)`);
}

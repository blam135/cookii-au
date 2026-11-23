// Read-only deployment check. Usage: node scripts/check-security-headers.mjs <frontend-https-url> <api-https-url>
const [frontend, api] = process.argv.slice(2);
if (!frontend || !api)
  throw new Error('Supply the frontend URL and API /reviews URL.');
for (const [kind, address] of [
  ['frontend', frontend],
  ['api', api],
]) {
  const url = new URL(address);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Use HTTPS URLs without credentials.');
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  const checks = {
    'successful response': response.ok,
    nosniff: response.headers.get('x-content-type-options') === 'nosniff',
    HSTS: /max-age=[1-9][0-9]*/i.test(
      response.headers.get('strict-transport-security') ?? '',
    ),
    'frame protection': /frame-ancestors\s+'none'/i.test(
      response.headers.get('content-security-policy') ?? '',
    ),
    'referrer policy': [
      'no-referrer',
      'strict-origin-when-cross-origin',
    ].includes(response.headers.get('referrer-policy')),
    'permissions policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
    ].every((value) =>
      (response.headers.get('permissions-policy') ?? '').includes(value),
    ),
  };
  if (kind === 'frontend') {
    const html = await response.text();
    checks['script CSP'] =
      /script-src\s/.test(
        response.headers.get('content-security-policy') ?? '',
      ) ||
      /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="[^"]*script-src\s/i.test(
        html,
      );
  } else {
    checks['JSON response'] = (
      response.headers.get('content-type') ?? ''
    ).includes('application/json');
    checks['no-store'] = response.headers.get('cache-control') === 'no-store';
  }
  for (const [name, passed] of Object.entries(checks)) {
    console.log(`${passed ? 'PASS' : 'FAIL'} ${kind}: ${name}`);
    if (!passed) process.exitCode = 1;
  }
}

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function secureHtml(html, apiOrigin) {
  if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(apiOrigin)) throw new Error('Invalid CSP API origin');
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes, body]) => !/\bsrc\s*=/i.test(attributes) && body.length > 0)
    .map(([, , body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  const policy = [
    "default-src 'self'", `script-src 'self' ${[...new Set(hashes)].join(' ')}`,
    "script-src-attr 'none'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "font-src 'self'", `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'",
  ].join('; ');
  return html.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="strict-origin-when-cross-origin">`);
}

async function secureDirectory(directory, origin) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await secureDirectory(filename, origin);
    else if (entry.name.endsWith('.html')) {
      await writeFile(filename, secureHtml(await readFile(filename, 'utf8'), origin));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Next reads .env.local internally; load it for this separate build process.
  const { default: nextEnv } = await import('@next/env');
  nextEnv.loadEnvConfig(process.cwd());
  await secureDirectory('out', process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') || 'https://example.invalid');
  console.log('Applied hash-based CSP to exported HTML.');
}

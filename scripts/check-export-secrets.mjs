import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Check exact configured private values, including common encoded forms.
// This complements repository secret scanning; it is not a general secret detector.
export async function checkExportSecrets(directory, env = process.env) {
  const secrets = [
    'NOTION_TOKEN',
    'TURNSTILE_SECRET',
    'IP_HASH_SECRET',
    'CLOUDFLARE_API_TOKEN',
  ].flatMap((name) =>
    env[name]
      ? [
          env[name],
          JSON.stringify(env[name]).slice(1, -1),
          encodeURIComponent(env[name]),
          Buffer.from(env[name]).toString('base64'),
        ]
      : [],
  );
  if (!secrets.length) return;
  async function inspect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) await inspect(filename);
      else if (entry.isFile()) {
        const content = await readFile(filename);
        if (secrets.some((secret) => content.includes(Buffer.from(secret))))
          throw new Error(
            'Private credential detected in frontend export. Build rejected.',
          );
      }
    }
  }
  await inspect(directory);
}

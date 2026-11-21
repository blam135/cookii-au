import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

interface DeploymentSettings {
  vars: {
    ALLOWED_ORIGIN: string;
    TURNSTILE_HOSTNAME: string;
    NOTION_DATA_SOURCE_ID: string;
    SUBMISSIONS_ENABLED: string;
  };
  secrets: {
    NOTION_TOKEN: string;
    TURNSTILE_SECRET: string;
    IP_HASH_SECRET: string;
  };
}

export function deploymentConfig(env: NodeJS.ProcessEnv): DeploymentSettings {
  const required = [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'ALLOWED_ORIGIN',
    'TURNSTILE_HOSTNAME',
    'NOTION_DATA_SOURCE_ID',
    'NOTION_TOKEN',
    'TURNSTILE_SECRET',
    'IP_HASH_SECRET',
  ];
  for (const name of required)
    if (!env[name]?.trim())
      throw new Error(`Missing deployment setting: ${name}`);
  const origin = new URL(env.ALLOWED_ORIGIN!);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== env.ALLOWED_ORIGIN ||
    origin.hostname !== env.TURNSTILE_HOSTNAME ||
    /example|localhost/.test(origin.hostname)
  )
    throw new Error(
      'Set a production HTTPS origin and matching Turnstile hostname.',
    );
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID!))
    throw new Error('Invalid Cloudflare account ID.');
  if (!/^[a-f0-9-]{32,36}$/i.test(env.NOTION_DATA_SOURCE_ID!))
    throw new Error('Invalid Notion data source ID.');
  if (env.IP_HASH_SECRET!.length < 32)
    throw new Error('IP_HASH_SECRET must contain at least 32 characters.');
  const enabled = env.SUBMISSIONS_ENABLED || 'false';
  if (!['true', 'false'].includes(enabled))
    throw new Error('SUBMISSIONS_ENABLED must be true or false.');
  return {
    vars: {
      ALLOWED_ORIGIN: env.ALLOWED_ORIGIN!,
      TURNSTILE_HOSTNAME: env.TURNSTILE_HOSTNAME!,
      NOTION_DATA_SOURCE_ID: env.NOTION_DATA_SOURCE_ID!,
      SUBMISSIONS_ENABLED: enabled,
    },
    secrets: {
      NOTION_TOKEN: env.NOTION_TOKEN!,
      TURNSTILE_SECRET: env.TURNSTILE_SECRET!,
      IP_HASH_SECRET: env.IP_HASH_SECRET!,
    },
  };
}

export function deploy(
  env: NodeJS.ProcessEnv = process.env,
  runner: typeof spawnSync = spawnSync,
  extraArgs: string[] = [],
): void {
  const config = deploymentConfig(env);
  const directory = mkdtempSync(join(tmpdir(), 'cookii-deploy-'));
  try {
    const secretsFile = join(directory, 'secrets.json');
    writeFileSync(secretsFile, JSON.stringify(config.secrets), {
      mode: 0o600,
    });
    const args = [
      fileURLToPath(
        new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
      ),
      'deploy',
      '--secrets-file',
      secretsFile,
    ];
    for (const [name, value] of Object.entries(config.vars))
      args.push('--var', `${name}:${value}`);
    args.push(...extraArgs);
    const result = runner(process.execPath, args, {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...env, WRANGLER_SEND_METRICS: 'false' },
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0)
      throw new Error('Cloudflare deployment failed.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    deploy(
      process.env,
      spawnSync,
      process.argv.includes('--dry-run') ? ['--dry-run'] : [],
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Deployment failed.',
    );
    process.exitCode = 1;
  }
}

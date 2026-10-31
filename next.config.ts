import type { NextConfig } from 'next';

// NEXT_PUBLIC values are bundled. Fail the build before a privileged key can leak.
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (publicKey && !publicKey.startsWith('sb_publishable_')) {
  let anonymous = false;
  try {
    anonymous = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role === 'anon';
  } catch { /* Invalid credentials must fail closed. */ }
  if (!anonymous) throw new Error('Supabase requires a publishable or legacy anon key, never a secret/service-role key.');
}
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl && !/^https:\/\/[^/]+\/?$/.test(supabaseUrl)) {
  throw new Error('Supabase URL must be an HTTPS origin.');
}

const basePath = '';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

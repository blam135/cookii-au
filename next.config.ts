import type { NextConfig } from 'next';

const reviewsUrl = process.env.NEXT_PUBLIC_REVIEWS_API_URL;
if (reviewsUrl) {
  const parsed = new URL(reviewsUrl);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    throw new Error(
      'Reviews API base URL must be an HTTPS origin without a path, credentials, query, or fragment.',
    );
  }
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

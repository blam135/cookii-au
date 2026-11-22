export const featureFlags = {
  reviews: process.env.NEXT_PUBLIC_REVIEWS_ENABLED === 'true',
} as const;

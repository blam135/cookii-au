import { reviewInputSchema, type Review, type ReviewInput } from './schema';
export type { Review, ReviewInput, ReviewSubmission } from './schema';

export function isReviewInput(value: unknown): value is ReviewInput {
  return reviewInputSchema.safeParse(value).success;
}

export interface ReviewCache {
  rows: Review[];
  expires: number;
}

export type ReviewResult =
  | { kind: 'success'; reviews: Review[] }
  | { kind: 'rate-limited' }
  | { kind: 'verification-failed' };

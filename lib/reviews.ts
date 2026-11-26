import {
  clientReviewInputSchema,
  reviewSchema,
  type Review,
  type ReviewInput,
} from '../backend/src/reviews/schema';
export type { Review, ReviewInput } from '../backend/src/reviews/schema';

const baseUrl = process.env.NEXT_PUBLIC_REVIEWS_API_URL?.replace(/\/+$/, '');
const url = baseUrl ? `${baseUrl}/reviews` : undefined;
export const reviewsConfigured = Boolean(
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
  baseUrl &&
  /^https:\/\/[^/?#]+$/.test(baseUrl),
);

export class ReviewError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(
      status === 429
        ? 'Too many reviews right now. Please try again later.'
        : status === 403
          ? 'Verification failed. Please verify again and try submitting your review.'
          : status === 409
            ? 'This review has already been submitted.'
            : 'Unable to access reviews.',
    );
    this.status = status;
  }
}

export function isReviewInput(value: unknown): value is ReviewInput {
  return clientReviewInputSchema.safeParse(value).success;
}

function isReview(value: unknown): value is Review {
  return reviewSchema.safeParse(value).success;
}

async function request(
  init: Omit<RequestInit, 'headers'> & {
    headers?: Record<string, string>;
  } = {},
): Promise<Review[]> {
  if (!reviewsConfigured || !url)
    throw new Error('Reviews are not configured.');
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) throw new ReviewError(response.status);
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every(isReview))
    throw new Error('Unexpected reviews response.');
  return data;
}

export function loadReviews(): Promise<Review[]> {
  return request();
}

export async function saveReview(
  input: ReviewInput,
  turnstileToken: string,
): Promise<Review> {
  if (!turnstileToken || !isReviewInput(input))
    throw new Error('Please enter a name, review, and rating from 1 to 5.');
  const review = {
    name: input.name.trim(),
    text: input.text.trim(),
    rating: input.rating,
  };
  if (!isReviewInput(review))
    throw new Error('Please enter a name, review, and rating from 1 to 5.');
  const rows = await request({
    method: 'POST',
    body: JSON.stringify({ ...review, turnstileToken }),
  });
  if (rows.length !== 1) throw new Error('Unexpected save response.');
  return rows[0];
}

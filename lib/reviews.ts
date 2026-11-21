export type Review = { id: string; name: string; rating: number; text: string };
export type ReviewInput = Omit<Review, 'id'>;

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
        : status === 409
          ? 'This review has already been submitted.'
          : 'Unable to access reviews.',
    );
    this.status = status;
  }
}

export function isReviewInput(value: unknown): value is ReviewInput {
  if (!value || typeof value !== 'object') return false;
  const review = value as Partial<ReviewInput>;
  // eslint-disable-next-line no-control-regex
  return (
    typeof review.name === 'string' &&
    review.name.trim().length > 0 &&
    review.name.length <= 40 &&
    !/[\u0000-\u001f\u007f]/u.test(review.name) &&
    // Reject non-printing control characters; tabs/newlines are allowed in review text.
    // eslint-disable-next-line no-control-regex
    typeof review.text === 'string' &&
    review.text.trim().length > 0 &&
    review.text.length <= 400 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(review.text) &&
    typeof review.rating === 'number' &&
    Number.isInteger(review.rating) &&
    review.rating >= 1 &&
    review.rating <= 5
  );
}

function isReview(value: unknown): value is Review {
  return isReviewInput(value) && 'id' in value && typeof value.id === 'string';
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

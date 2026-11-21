export interface ReviewInput {
  name: string;
  rating: number;
  text: string;
}

export interface Review extends ReviewInput {
  id: string;
}

export interface ReviewSubmission extends ReviewInput {
  verificationToken: string;
}

export function isReviewInput(value: unknown): value is ReviewInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    Object.keys(input).sort().join(',') === 'name,rating,text' &&
    typeof input.name === 'string' &&
    input.name.trim().length > 0 &&
    input.name.length <= 40 &&
    !/[\u0000-\u001f\u007f]/u.test(input.name) &&
    typeof input.text === 'string' &&
    input.text.trim().length > 0 &&
    input.text.length <= 400 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input.text) &&
    typeof input.rating === 'number' &&
    Number.isInteger(input.rating) &&
    input.rating >= 1 &&
    input.rating <= 5
  );
}

export interface ReviewCache {
  rows: Review[];
  expires: number;
}

export type ReviewResult =
  | { kind: 'success'; reviews: Review[] }
  | { kind: 'rate-limited' }
  | { kind: 'verification-failed' };

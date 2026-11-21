import { isReviewInput, type ReviewSubmission } from './model';

export function parseSubmission(value: unknown): ReviewSubmission | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { turnstileToken, ...input } = value as Record<string, unknown>;
  if (
    !isReviewInput(input) ||
    typeof turnstileToken !== 'string' ||
    !turnstileToken ||
    turnstileToken.length > 2048
  )
    return null;
  return { ...input, verificationToken: turnstileToken };
}

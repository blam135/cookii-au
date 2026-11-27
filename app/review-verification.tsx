'use client';

import { Turnstile } from '@marsidev/react-turnstile';

export type ReviewVerificationState = { token: string; error?: string };

export default function ReviewVerification({
  onChange,
}: {
  onChange: (state: ReviewVerificationState) => void;
}) {
  const invalidate = (error: string) => onChange({ token: '', error });
  const expire = () => invalidate('Verification expired. Please verify again.');
  return (
    <Turnstile
      className="review-verification"
      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
      options={{ size: 'flexible', theme: 'light', action: 'review' }}
      aria-label="Spam verification"
      scriptOptions={{
        onError: () =>
          invalidate(
            'We couldn’t load the verification. Please refresh to try again.',
          ),
      }}
      onSuccess={(token) => onChange({ token })}
      onExpire={expire}
      onTimeout={expire}
      onError={() =>
        invalidate('Verification failed. Please try again or refresh the page.')
      }
    />
  );
}

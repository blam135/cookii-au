'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useState } from 'react';
import ReviewStatus, { type ReviewFeedback } from './review-status';

export default function ReviewVerification({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const [status, setStatus] = useState<ReviewFeedback>({
    tone: 'info',
    message: 'Loading verification…',
  });
  const invalidate = (message: string) => {
    onToken('');
    setStatus({ tone: 'error', message });
  };
  return (
    <div className="review-verification">
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
        options={{ size: 'flexible', theme: 'light', action: 'review' }}
        aria-label="Spam verification"
        scriptOptions={{
          onError: () =>
            invalidate(
              'We couldn’t load the verification. Please refresh to try again.',
            ),
        }}
        onWidgetLoad={() =>
          setStatus({
            tone: 'info',
            message: 'Complete verification to share your review.',
          })
        }
        onSuccess={(token) => {
          onToken(token);
          setStatus({ tone: 'success', message: 'Verification complete.' });
        }}
        onExpire={() =>
          invalidate('Verification expired. Please verify again.')
        }
        onError={() =>
          invalidate(
            'Verification failed. Please try again or refresh the page.',
          )
        }
        onTimeout={() =>
          invalidate('Verification expired. Please verify again.')
        }
      />
      <ReviewStatus className="review-verification-status" feedback={status} />
    </div>
  );
}

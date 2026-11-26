'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useState } from 'react';

export default function ReviewVerification({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const [status, setStatus] = useState('Loading spam verification…');
  const invalidate = (message: string) => {
    onToken('');
    setStatus(message);
  };
  return (
    <>
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
        options={{ size: 'compact', action: 'review' }}
        aria-label="Spam verification"
        scriptOptions={{
          onError: () =>
            invalidate(
              'We couldn’t load the verification. Please refresh to try again.',
            ),
        }}
        onWidgetLoad={() =>
          setStatus('Please complete the verification below.')
        }
        onSuccess={(token) => {
          onToken(token);
          setStatus('Verification complete.');
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
      <output className="review-verification-status" aria-live="polite">
        {status}
      </output>
    </>
  );
}

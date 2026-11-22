'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          size: 'compact';
          action: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}
export default function ReviewVerification({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading spam verification…');
  const fail = () => {
    onToken('');
    setStatus(
      'We couldn’t load the verification. Please refresh to try again.',
    );
  };
  useEffect(() => {
    if (!ready || !container.current) return;
    const api = window.turnstile;
    if (!api) {
      onToken('');
      setStatus(
        'We couldn’t load the verification. Please refresh to try again.',
      );
      return;
    }
    let id: string;
    try {
      setStatus('Please complete the verification below.');
      id = api.render(container.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
        size: 'compact',
        action: 'review',
        callback: (token) => {
          onToken(token);
          setStatus('Verification complete.');
        },
        'expired-callback': () => {
          onToken('');
          setStatus('Verification expired. Please verify again.');
        },
        'error-callback': () => {
          onToken('');
          setStatus(
            'Verification failed. Please try again or refresh the page.',
          );
        },
      });
    } catch {
      onToken('');
      setStatus(
        'We couldn’t load the verification. Please refresh to try again.',
      );
      return;
    }
    return () => {
      api.remove(id);
    };
  }, [ready, onToken]);
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={fail}
      />
      <div ref={container} aria-label="Spam verification" />
      <output className="review-verification-status" aria-live="polite">
        {status}
      </output>
    </>
  );
}

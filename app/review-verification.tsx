'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; size: 'compact'; action: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
      remove: (id: string) => void;
    };
  }
}
export default function ReviewVerification({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !container.current || !window.turnstile) return;
    const api = window.turnstile;
    const id = api.render(container.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '', size: 'compact', action: 'review', callback: onToken,
      'expired-callback': () => onToken(''), 'error-callback': () => onToken(''),
    });
    return () => { api.remove(id); };
  }, [ready, onToken]);
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setReady(true)} />
    <div ref={container} aria-label="Spam verification" />
  </>;
}

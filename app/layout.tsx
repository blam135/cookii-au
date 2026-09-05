import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const display = localFont({
  src: './fonts/cormorant-garamond-latin.woff2',
  variable: '--font-cormorant',
  weight: '400 700',
  display: 'swap',
});

const body = localFont({
  src: './fonts/manrope-latin.woff2',
  variable: '--font-manrope',
  weight: '200 800',
  display: 'swap',
});

const brand = localFont({
  src: './fonts/bodoni-moda-latin.woff2',
  variable: '--font-bodoni',
  weight: '500 700',
  display: 'swap',
});

const mono = localFont({
  src: [
    { path: './fonts/dm-mono-regular-latin.woff2', weight: '400' },
    { path: './fonts/dm-mono-medium-latin.woff2', weight: '500' },
  ],
  variable: '--font-dm-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cookii by Talya | Home-baked cookies',
  description: 'Small-batch chocolate chunk and matcha cookies, baked to order by Talya.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} ${brand.variable} ${mono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

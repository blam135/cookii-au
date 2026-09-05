'use client';

import Image from 'next/image';
import { useEffect } from 'react';
import primaryLogo from '../images/brand/cookii-logo-primary-transparent.png';
import {
  BadgeDollarSign,
  ChefHat,
  Clock3,
  CookingPot,
  PackageOpen,
} from 'lucide-react';

const assetPath = (path: string) =>
  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;

const flavours = [
  {
    number: '01',
    name: 'Classic chocolate chunk',
    note: 'The original — golden, soft-centred and loaded with chocolate chunks.',
    batch: '$30',
    tone: 'classic',
    image: assetPath('/classic-chocolate-original.jpg'),
    alt: 'Classic chocolate chunk cookies cooling on a wire rack',
  },
  {
    number: '02',
    name: 'Brown butter chocolate chunk',
    note: 'Deep, nutty brown butter with generous pockets of chocolate.',
    batch: '$30',
    tone: 'brown-butter',
    image: assetPath('/brown-butter-original.jpg'),
    alt: 'Brown butter chocolate chunk cookies beside a vase of pink flowers',
  },
  {
    number: '03',
    name: 'Matcha white chocolate',
    note: 'Earthy matcha balanced with creamy white chocolate pieces.',
    batch: '$40',
    tone: 'matcha',
    image: assetPath('/matcha-original.jpg'),
    alt: 'Matcha white chocolate cookies served on a dark ceramic plate',
  },
];

const standardPrices = [
  ['1 cookii', '$2'],
  ['2 cookiis', '$4'],
  ['5 cookiis', '$10'],
  ['10 cookiis', '$20'],
];

const orderNotes = [
  {
    word: 'one',
    title: 'Payment',
    Icon: BadgeDollarSign,
    points: [
      'Payment is accepted by bank transfer or cash.',
      'Transfer details will be provided when your order is confirmed.',
    ],
  },
  {
    word: 'two',
    title: 'Availability',
    Icon: ChefHat,
    points: [
      'Orders usually open at the end of school terms and during school holidays.',
      'Availability may vary depending on Talya’s schedule.',
      'When pre-orders are open, an Instagram post or story will be shared.',
    ],
  },
  {
    word: 'three',
    title: 'Pre-order time',
    Icon: Clock3,
    points: [
      'Please order at least three days in advance, as every batch is made to order.',
      'Larger custom orders may require a little more time.',
    ],
  },
  {
    word: 'four',
    title: 'Allergens',
    Icon: CookingPot,
    points: [
      'Cookies contain gluten, dairy and egg.',
      'Cookies may contain traces of nuts and soy.',
      'Allergen-free batches aren’t available due to the risk of cross-contamination.',
    ],
  },
  {
    word: 'five',
    title: 'Packaging & order pickup',
    Icon: PackageOpen,
    points: [
      'Cookies are packaged in plastic containers or pouches.',
      'Custom order pickups are on Mondays unless arranged otherwise.',
      'Please message for more information about collecting your order.',
    ],
  },
];

export default function Home() {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Cookii by Talya, home">
          <Image
            className="wordmark-logo"
            src={primaryLogo}
            alt=""
            sizes="(max-width: 620px) 8.75rem, 10rem"
            priority
          />
        </a>
        <nav aria-label="Main navigation">
          <a href="#menu">Menu</a>
          <a href="#ordering">Before you order</a>
          <a className="nav-pill" href="#contact">Enquire</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow hero-kicker">Home baked · made to order</p>
          <div className="hero-brand">
            <h1>
              <Image
                className="hero-logo"
                src={primaryLogo}
                alt="Cookii by Talya"
                sizes="(max-width: 900px) calc(100vw - 2.5rem), 36rem"
              />
            </h1>
          </div>
          <p className="hero-tagline">
            A little joy,
            <br />
            <em>fresh from the oven.</em>
          </p>
          <p className="hero-intro">
            Small-batch cookies made by Talya, with soft centres, generous chunks
            and plenty of care.
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="#menu">See the menu</a>
            <a className="text-link" href="#ordering">How ordering works <span>↓</span></a>
          </div>
        </div>

        <div className="hero-image-wrap" aria-label="Freshly baked Cookii cookies">
          <Image
            className="hero-image"
            src={assetPath('/cookii-kitchen-original.jpg')}
            alt="Freshly baked chocolate chunk and matcha cookies cooling in Talya’s home kitchen"
            fill
            priority
            sizes="(max-width: 800px) 100vw, 55vw"
          />
        </div>

        <div className="scroll-note" aria-hidden="true">
          <span>Scroll to discover</span>
          <i />
        </div>
      </section>

      <section className="marquee" aria-label="Baked fresh, made with care">
        <div className="marquee-track">
          <div className="marquee-set">
            <span>Made with care</span><b>✦</b>
            <span>Baked fresh</span><b>✦</b>
            <span>Soft-centred</span><b>✦</b>
          </div>
          <div className="marquee-set" aria-hidden="true">
            <span>Made with care</span><b>✦</b>
            <span>Baked fresh</span><b>✦</b>
            <span>Soft-centred</span><b>✦</b>
          </div>
        </div>
      </section>

      <section className="manifesto">
        <p className="eyebrow" data-reveal>The Cookii philosophy</p>
        <p className="manifesto-copy" data-reveal>
          Handmade at home, <em>never hurried,</em> and baked especially for you.
        </p>
      </section>

      <section className="menu-section" id="menu">
        <p className="menu-rail" aria-hidden="true">Cookie menu</p>
        <div className="section-heading" data-reveal>
          <div>
            <p className="eyebrow">The cookie menu</p>
            <h2>Choose your <em>favourite.</em></h2>
          </div>
          <p>
            Every batch is baked to order. Other quantities may be available —
            just reach out.
          </p>
        </div>

        <div className="flavour-list">
          {flavours.map((flavour) => (
            <article className={`flavour ${flavour.tone}`} key={flavour.name} data-reveal>
              <div className="flavour-number">{flavour.number}</div>
              <div className="flavour-photo">
                <Image src={flavour.image} alt={flavour.alt} fill sizes="180px" />
              </div>
              <div className="flavour-copy">
                <h3>{flavour.name}</h3>
                <p>{flavour.note}</p>
              </div>
              <dl className="price-list">
                {standardPrices.map(([quantity, price]) => (
                  <div key={quantity}>
                    <dt>{quantity}</dt>
                    <dd>{price}</dd>
                  </div>
                ))}
                <div className="batch-price">
                  <dt>Whole batch</dt>
                  <dd>{flavour.batch}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="order-section" id="ordering">
        <div className="order-masthead" data-reveal>
          <div>
            <p>Things to know before you</p>
            <h2>Order</h2>
          </div>
        </div>

        <div className="order-notes">
          {orderNotes.map(({ word, title, Icon, points }) => (
            <article key={word} data-reveal>
              <span className="order-word">{word}</span>
              <Icon className="order-icon" strokeWidth={1.15} aria-hidden="true" />
              <div className="order-note-copy">
                <h3>{title}</h3>
                <ul>
                  {points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>

      </section>

      <section className="contact-section" id="contact">
        <div className="contact-orbit" aria-hidden="true"><span>✦</span></div>
        <p className="eyebrow" data-reveal>Craving cookies?</p>
        <h2 data-reveal>Let’s make your<br /><em>next batch.</em></h2>
        <p className="contact-copy" data-reveal>
          Message Cookii by Talya on Instagram to ask about current availability,
          quantities or custom orders.
        </p>
        <a
          className="button button-light"
          href="https://www.instagram.com/cookii_bytalya/"
          target="_blank"
          rel="noreferrer"
          data-reveal
        >
          <svg className="instagram-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4.25" />
            <circle className="instagram-icon-dot" cx="17.35" cy="6.75" r="1" />
          </svg>
          Message on Instagram
        </a>
      </section>

      <footer>
        <a className="footer-logo-link" href="#top" aria-label="Cookii by Talya, back to top">
          <Image className="footer-logo" src={primaryLogo} alt="Cookii by Talya" fill sizes="14rem" />
        </a>
        <p>Home-baked cookies by Talya.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}

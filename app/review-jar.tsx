'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Star, X } from 'lucide-react';
import jarBody from '../images/reviews/jar-body.webp';
import emptyJarBody from '../images/reviews/empty-jar-body.webp';
import jarLid from '../images/reviews/jar-lid.webp';
import insideJar from '../images/reviews/inside-cookie-jar.webp';
import insideEmptyJar from '../images/reviews/inside-empty-jar.webp';
import { reviewsConfigured, type Review } from '@/lib/reviews';
import styles from './review-jar.module.css';

type ReviewJarProps = {
  reviews: Review[];
  loading: boolean;
  loadError: boolean;
};

export default function ReviewJar({
  reviews,
  loading,
  loadError,
}: ReviewJarProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const mouth = useRef<HTMLImageElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const isEmpty =
    reviewsConfigured && !loading && !loadError && reviews.length === 0;
  const interior = isEmpty ? insideEmptyJar : insideJar;

  function openJar() {
    const popup = dialog.current;
    const rim = mouth.current?.getBoundingClientRect();
    if (!popup || !rim) return;
    const diameter = Math.min(window.innerWidth, window.innerHeight) * 0.82;
    const x = rim.left + rim.width / 2 - window.innerWidth / 2;
    const y = rim.top + rim.height / 2 - window.innerHeight / 2;
    popup.style.setProperty('--opening-size', `${diameter}px`);
    popup.style.setProperty(
      '--from-mouth',
      `translate(${x}px, ${y}px) scale(${rim.width / diameter}, ${rim.height / diameter})`,
    );
    popup.showModal();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.jar}
        aria-haspopup="dialog"
        aria-controls="review-jar-dialog"
        onClick={openJar}
      >
        <span className={styles.jarArt} aria-hidden="true">
          <Image
            src={isEmpty ? emptyJarBody : jarBody}
            alt=""
            className={styles.body}
            draggable={false}
          />
          <Image
            ref={mouth}
            src={interior}
            alt=""
            className={styles.mouth}
            draggable={false}
          />
          <Image src={jarLid} alt="" className={styles.lid} draggable={false} />
        </span>
        <span className={styles.jarLabel}>
          Open the cookie jar <ArrowUpRight size={17} aria-hidden="true" />
        </span>
      </button>
      <dialog
        ref={dialog}
        id="review-jar-dialog"
        className={styles.dialog}
        data-empty={isEmpty || undefined}
        aria-labelledby="review-jar-title"
        closedby="any"
        onClose={() => trigger.current?.focus({ preventScroll: true })}
      >
        <Image
          src={interior}
          alt=""
          className={styles.openingView}
          draggable={false}
        />
        <div className={styles.dialogContent}>
          <div className={styles.dialogHeader}>
            <h3 id="review-jar-title">The cookie jar</h3>
            <button
              type="button"
              className={styles.close}
              aria-label="Close cookie jar"
              onClick={() => dialog.current?.close()}
            >
              <X size={21} aria-hidden="true" />
            </button>
          </div>
          <section
            className={styles.scrollArea}
            aria-label="Customer reviews"
            tabIndex={reviews.length > 0 ? 0 : -1}
          >
            {loading && <output>Loading sweet words…</output>}
            {loadError && (
              <output>
                We couldn’t load reviews. Please refresh to try again.
              </output>
            )}
            {isEmpty && (
              <div className={styles.emptyState}>
                <Image
                  src={insideEmptyJar}
                  alt=""
                  className={styles.emptyGlass}
                />
                <p>Be the first to share your cookie moment.</p>
              </div>
            )}
            {!reviewsConfigured && <p>Reviews are coming soon.</p>}
            {reviews.length > 0 && (
              <div className={styles.list}>
                {reviews.map((review) => (
                  <article className={styles.card} key={review.id}>
                    <div className={styles.wrapper}>
                      <span className={styles.ratingText}>
                        {review.rating} out of 5 stars
                      </span>
                      <span className={styles.stars} aria-hidden="true">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={15}
                            fill={
                              star <= review.rating ? 'currentColor' : 'none'
                            }
                          />
                        ))}
                      </span>
                      <blockquote>“{review.text}”</blockquote>
                      <p className={styles.author}>{review.name}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </dialog>
    </>
  );
}

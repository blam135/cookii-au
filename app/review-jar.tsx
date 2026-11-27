'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Star, X } from 'lucide-react';
import jarPhoto from '../images/reviews/cookie-jar.webp';
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
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.jar}
        aria-haspopup="dialog"
        aria-controls="review-jar-dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Image src={jarPhoto} alt="" className={styles.jarArt} />
        <span className={styles.jarLabel}>
          Open the cookie jar <ArrowUpRight size={17} aria-hidden="true" />
        </span>
      </button>
      <dialog
        ref={dialog}
        id="review-jar-dialog"
        className={styles.dialog}
        aria-labelledby="review-jar-title"
        closedby="any"
        onClose={() => trigger.current?.focus({ preventScroll: true })}
      >
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
            {!loading && !loadError && reviews.length === 0 && (
              <p>
                {reviewsConfigured
                  ? 'Be the first to share your cookie moment.'
                  : 'Reviews are coming soon.'}
              </p>
            )}
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

'use client';

import { useRef, useState, type SubmitEvent } from 'react';
import { ArrowUpRight, Star } from 'lucide-react';
import useSWR from 'swr';
import { useController, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import ReviewStatus from './review-status';
import ReviewVerification, {
  type ReviewVerificationState,
} from './review-verification';

import {
  ReviewError,
  clientReviewInputSchema,
  loadReviews,
  reviewsConfigured,
  saveReview,
  type Review,
  type ReviewInput,
} from '@/lib/reviews';

// Trim browser form values before applying the shared validation policy.
const formSchema = clientReviewInputSchema.extend({
  name: z.string().trim().pipe(clientReviewInputSchema.shape.name),
  text: z.string().trim().pipe(clientReviewInputSchema.shape.text),
});

export default function Reviews() {
  const {
    data: fetchedReviews,
    isLoading: loading,
    mutate,
  } = useSWR<Review[] | null>(
    reviewsConfigured ? 'customer-reviews' : null,
    () => loadReviews().catch(() => null),
    {
      focusThrottleInterval: 0,
      dedupingInterval: 0,
      shouldRetryOnError: false,
    },
  );
  const loadError = fetchedReviews === null;
  const reviews = fetchedReviews ?? [];
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting: submitting },
  } = useForm<ReviewInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', text: '', rating: 5 },
  });
  const { field: ratingField } = useController({ control, name: 'rating' });
  const rating = ratingField.value;
  const [hovered, setHovered] = useState(0);
  const [formError, setFormError] = useState('');
  const [verification, setVerification] = useState<ReviewVerificationState>({
    token: '',
  });
  const [verificationVersion, setVerificationVersion] = useState(0);

  const saving = useRef(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // Lock before async schema validation, so rapid submissions cannot overlap.
    if (saving.current || !reviewsConfigured) return;
    saving.current = true;
    try {
      await handleSubmit(save, () =>
        setFormError(
          'Please add your name and a few words about your cookies.',
        ),
      )(event);
    } finally {
      saving.current = false;
    }
  }

  async function save(input: ReviewInput) {
    if (!verification.token) {
      setFormError('Please complete verification before sharing.');
      return;
    }
    setFormError('');
    try {
      const saved = await saveReview(input, verification.token);
      // Publish only the confirmed server result; do not spend another GET quota.
      await mutate(
        (current) =>
          [
            saved,
            ...(current ?? []).filter((row) => row.id !== saved.id),
          ].slice(0, 20),
        { revalidate: false },
      );
      reset();
      setHovered(0);
    } catch (error) {
      setFormError(
        error instanceof ReviewError && [403, 409, 429].includes(error.status)
          ? error.message
          : 'We couldn’t confirm your review was saved. Please refresh to check before trying again.',
      );
    } finally {
      setVerification({ token: '' });
      setVerificationVersion((v) => v + 1);
    }
  }

  return (
    <section
      className="reviews-section"
      id="reviews"
      aria-labelledby="reviews-heading"
    >
      <div className="reviews-layout">
        <header className="reviews-heading" data-reveal>
          <p className="eyebrow">Little notes, big smiles</p>
          <h2 id="reviews-heading">
            Sweet words.
            <br />
            <em>Happy crumbs.</em>
          </h2>
          <p>A few kind words from the cookie jar.</p>
        </header>
        <form
          className="review-form"
          onSubmit={submit}
          onChange={() => setFormError('')}
        >
          <span className="review-form-flourish" aria-hidden="true">
            ✦
          </span>
          <h3>Had a little bite?</h3>
          <p>Leave a little love.</p>
          <fieldset
            className="review-rating"
            disabled={submitting || !reviewsConfigured}
          >
            <legend>Your rating</legend>
            <div>
              {[1, 2, 3, 4, 5].map((star) => (
                <label
                  className={`rating-star${star <= (hovered || rating) ? ' is-filled' : ''}`}
                  key={star}
                >
                  <input
                    type="radio"
                    name={ratingField.name}
                    value={star}
                    checked={rating === star}
                    onChange={() => ratingField.onChange(star)}
                    onBlur={ratingField.onBlur}
                    ref={ratingField.ref}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                  />
                  <Star aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>
          <label className="review-field">
            Your name
            <input
              disabled={!reviewsConfigured}
              readOnly={submitting}
              {...register('name')}
              placeholder="First name is lovely"
              maxLength={40}
              required
              autoComplete="name"
            />
          </label>
          <label className="review-field">
            Your cookie moment
            <textarea
              disabled={!reviewsConfigured}
              readOnly={submitting}
              {...register('text')}
              placeholder="The flavour, the first bite, the empty box…"
              rows={4}
              maxLength={400}
              required
            />
          </label>
          {reviewsConfigured && (
            <ReviewVerification
              key={verificationVersion}
              onChange={setVerification}
            />
          )}
          <button
            className="button button-dark"
            type="submit"
            disabled={submitting || !reviewsConfigured || !verification.token}
          >
            {submitting ? 'Sharing…' : 'Share a little love'}{' '}
            <ArrowUpRight size={17} aria-hidden="true" />
          </button>
          <ReviewStatus error={formError || verification.error} />
          <p className="review-storage-note">
            {reviewsConfigured
              ? 'Your name, rating, and review will be visible to everyone.'
              : 'Review submissions will open soon.'}
          </p>
        </form>
        <div className="review-list" aria-label="Cookie reviews">
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
          {reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <div className="review-card-top">
                <span
                  className="review-stars"
                  aria-label={`${review.rating} out of 5 stars`}
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={16}
                      fill={star <= review.rating ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                  ))}
                </span>
                <span className="review-kind">Customer review</span>
              </div>
              <blockquote>“{review.text}”</blockquote>
              <p className="review-author">
                <span aria-hidden="true">
                  {review.name.slice(0, 1).toUpperCase()}
                </span>
                {review.name}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

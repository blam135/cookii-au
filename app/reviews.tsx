'use client';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { ArrowUpRight, Star } from 'lucide-react';

import { ReviewError, isReviewInput, loadReviews, reviewsConfigured, saveReview, type Review } from '@/lib/reviews';

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [hovered, setHovered] = useState(0);
  const [status, setStatus] = useState('');

  const [loading, setLoading] = useState(reviewsConfigured);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const saving = useRef(false);

  useEffect(() => {
    if (!reviewsConfigured) return;
    let active = true;
    loadReviews().then((loaded) => {
      if (active) setReviews((current) => [...current, ...loaded.filter((row) => !current.some((item) => item.id === row.id))].slice(0, 20));
    }).catch(() => {
      if (active) setLoadError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !reviewsConfigured) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const nameField = fields.get('name');
    const textField = fields.get('review');
    const name = typeof nameField === 'string' ? nameField.trim() : '';
    const text = typeof textField === 'string' ? textField.trim() : '';
    if (!isReviewInput({ name, text, rating })) {
      setStatus('Please add your name and a few words about your cookies.');
      return;
    }
    saving.current = true;
    setSubmitting(true);
    setStatus('');
    try {
      const saved = await saveReview({ name, text, rating });
      setReviews((current) => [saved, ...current].slice(0, 20));
      setStatus('A little sweetness, shared. Your review has been published.');
      form.reset();
      setRating(5);
      setHovered(0);
    } catch (error) {
      setStatus(error instanceof ReviewError && [409, 429].includes(error.status) ? error.message : 'We couldn’t confirm your review was saved. Please refresh to check before trying again.');
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="reviews-section" id="reviews" aria-labelledby="reviews-heading">
      <div className="reviews-heading" data-reveal>
        <div>
          <p className="eyebrow">Little notes, big smiles</p>
          <h2 id="reviews-heading">Sweet words.<br /><em>Happy crumbs.</em></h2>
        </div>
        <p>A few kind words from the cookie jar.</p>
      </div>
      <div className="reviews-layout">
        <div className="review-list" aria-label="Cookie reviews">
          {loading && <output>Loading sweet words…</output>}
          {loadError && <output>We couldn’t load reviews. Please refresh to try again.</output>}
          {!loading && !loadError && reviews.length === 0 && <p>{reviewsConfigured ? 'Be the first to share your cookie moment.' : 'Reviews are coming soon.'}</p>}
          {reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <div className="review-card-top">
                <span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={16} fill={star <= review.rating ? 'currentColor' : 'none'} aria-hidden="true" />)}
                </span>
                <span className="review-kind">Customer review</span>
              </div>
              <blockquote>“{review.text}”</blockquote>
              <p className="review-author"><span aria-hidden="true">{review.name.slice(0, 1).toUpperCase()}</span>{review.name}</p>
            </article>
          ))}
        </div>
        <form className="review-form" onSubmit={submit}>
          <span className="review-form-flourish" aria-hidden="true">✦</span>
          <h3>Had a little bite?</h3>
          <p>Leave a little love.</p>
          <fieldset className="review-rating" disabled={submitting || !reviewsConfigured}>
            <legend>Your rating</legend>
            <div>
              {[1, 2, 3, 4, 5].map((star) => (
                <label className={`rating-star${star <= (hovered || rating) ? ' is-filled' : ''}`} key={star}>
                  <input type="radio" name="rating" value={star} checked={rating === star} onChange={() => setRating(star)} onMouseEnter={() => setHovered(star)} onMouseLeave={() => setHovered(0)} aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`} />
                  <Star aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>
          <label className="review-field">Your name<input disabled={submitting || !reviewsConfigured} name="name" placeholder="First name is lovely" maxLength={40} required autoComplete="name" /></label>
          <label className="review-field">Your cookie moment<textarea disabled={submitting || !reviewsConfigured} name="review" placeholder="The flavour, the first bite, the empty box…" rows={4} maxLength={400} required /></label>
          <button className="button button-dark" type="submit" disabled={submitting || !reviewsConfigured}>{submitting ? 'Sharing…' : 'Share a little love'} <ArrowUpRight size={17} aria-hidden="true" /></button>
          <p className="review-storage-note">{reviewsConfigured ? 'Your name, rating, and review will be visible to everyone.' : 'Review submissions will open soon.'}</p>
          <output className="review-status">{status}</output>
        </form>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { ArrowUpRight, Check, Star } from 'lucide-react';

type Review = { id: string; name: string; rating: number; text: string };
const storageKey = 'cookii-demo-reviews-v1';
const samples: Review[] = [
  { id: 'sample-1', name: 'Sophie', rating: 5, text: 'The brown butter ones barely made it home. Crispy edges, soft middles, and so much chocolate. Already dreaming about the next batch.' },
  { id: 'sample-2', name: 'James', rating: 5, text: 'Brought a box to a picnic and came home with an empty container. The classic chocolate chunk is a crowd favourite for a reason.' },
  { id: 'sample-3', name: 'Amelia', rating: 4, text: 'The matcha and white chocolate combo is such a lovely little treat. Beautifully packed, too — perfect with an afternoon cup of tea.' },
];

function isReview(value: unknown): value is Review {
  if (!value || typeof value !== 'object') return false;
  const review = value as Partial<Review>;
  return typeof review.id === 'string' && typeof review.name === 'string' &&
    review.name.trim().length > 0 && review.name.length <= 40 &&
    typeof review.text === 'string' && review.text.trim().length > 0 && review.text.length <= 400 &&
    typeof review.rating === 'number' && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5;
}

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [hovered, setHovered] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
        if (Array.isArray(stored)) setReviews(stored.filter(isReview).slice(0, 20));
      } catch {
        // A blocked or invalid browser store shouldn't prevent trying the demo.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const nameField = fields.get('name');
    const textField = fields.get('review');
    const name = typeof nameField === 'string' ? nameField.trim() : '';
    const text = typeof textField === 'string' ? textField.trim() : '';
    if (!name || !text) {
      setStatus('Please add your name and a few words about your cookies.');
      return;
    }
    const next = [{ id: crypto.randomUUID(), name, text, rating }, ...reviews].slice(0, 20);
    setReviews(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStatus('A little sweetness, shared. Your demo review is saved in this browser.');
    } catch {
      setStatus('A little sweetness, shared. Your demo review will stay until you refresh.');
    }
    form.reset();
    setRating(5);
    setHovered(0);
  }

  return (
    <section className="reviews-section" id="reviews" aria-labelledby="reviews-heading">
      <div className="reviews-heading" data-reveal>
        <div>
          <p className="eyebrow">Little notes, big smiles</p>
          <h2 id="reviews-heading">Sweet words.<br /><em>Happy crumbs.</em></h2>
        </div>
        <p>A few kind words from the cookie jar.<br /><span className="reviews-demo-label">Sample reviews · UI preview</span></p>
      </div>
      <div className="reviews-layout">
        <div className="review-list" aria-label="Cookie reviews">
          {[...reviews, ...samples].map((review) => (
            <article className="review-card" key={review.id}>
              <div className="review-card-top">
                <span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={16} fill={star <= review.rating ? 'currentColor' : 'none'} aria-hidden="true" />)}
                </span>
                <span className="review-kind">{review.id.startsWith('sample-') ? 'Sample review' : 'Your demo review'}</span>
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
          <fieldset className="review-rating">
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
          <label className="review-field">Your name<input name="name" placeholder="First name is lovely" maxLength={40} required autoComplete="name" /></label>
          <label className="review-field">Your cookie moment<textarea name="review" placeholder="The flavour, the first bite, the empty box…" rows={4} maxLength={400} required /></label>
          <button className="button button-dark" type="submit">Share a little love <ArrowUpRight size={17} aria-hidden="true" /></button>
          <p className="review-storage-note">Just a demo for now. Your reviews stay in this browser, with no public posting.</p>
          <output className="review-status">{status && <><Check size={16} aria-hidden="true" />{status}</>}</output>
        </form>
      </div>
    </section>
  );
}

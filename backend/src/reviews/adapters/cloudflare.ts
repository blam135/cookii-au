import type { Environment } from '../../config';
import type { ReviewCache } from '../model';
import type { ReviewState } from '../ports';
import { ReviewService } from '../service';
import { handleReviewRequest } from '../handlers';
import { NotionReviewRepository } from './notion';
import { TurnstileVerifier } from './turnstile';

interface ReviewBudget {
  day: number;
  submits: number;
  reads: number;
  nextRead?: number;
  ips: Record<string, { hour: number; count: number }>;
}

class CloudflareReviewState implements ReviewState {
  private readonly storage: DurableObjectStorage;
  private readonly secret: string;

  constructor(storage: DurableObjectStorage, secret: string) {
    this.storage = storage;
    this.secret = secret;
  }

  getCache(): Promise<ReviewCache | undefined> {
    return this.storage.get<ReviewCache>('cache');
  }

  setCache(cache: ReviewCache): Promise<void> {
    return this.storage.put('cache', cache);
  }

  private async budget(now: number): Promise<ReviewBudget> {
    const day = Math.floor(now / 86400000);
    const current = await this.storage.get<ReviewBudget>('budget');
    return current?.day === day
      ? current
      : { day, submits: 0, reads: 0, ips: {} };
  }

  async reserveRead(now: number): Promise<boolean> {
    const budget = await this.budget(now);
    if (budget.reads >= 1440 || now < (budget.nextRead ?? 0)) return false;
    budget.reads++;
    budget.nextRead = now + 60000;
    await this.storage.put('budget', budget);
    return true;
  }

  async reserveSubmission(ip: string, now: number): Promise<boolean> {
    const budget = await this.budget(now);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const digest = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${budget.day}:${ip}`),
    );
    const hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const hour = Math.floor(now / 3600000);
    const bucket =
      budget.ips[hash]?.hour === hour ? budget.ips[hash] : { hour, count: 0 };
    if (budget.submits >= 100 || bucket.count >= 3) return false;
    budget.submits++;
    bucket.count++;
    budget.ips[hash] = bucket;
    // Persist reservations before any external request, including failures.
    await this.storage.put('budget', budget);
    return true;
  }
}

export class ReviewsStore {
  private readonly context: DurableObjectState;
  private readonly service: ReviewService;

  constructor(context: DurableObjectState, env: Environment) {
    this.context = context;
    this.service = new ReviewService(
      new CloudflareReviewState(context.storage, env.IP_HASH_SECRET),
      new NotionReviewRepository(env),
      new TurnstileVerifier(env),
    );
  }

  fetch(request: Request): Promise<Response> {
    // Keep the entire use case serialized: quota reservations, external calls,
    // and cache writes share one boundary. Existing object names/keys are stable.
    return this.context.blockConcurrencyWhile(() =>
      handleReviewRequest(request, this.service),
    );
  }
}

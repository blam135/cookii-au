import type { Environment } from '../../config';
import {
  failureReason,
  RequestDiagnostics,
  REQUEST_ID_HEADER,
} from '../../diagnostics';
import type { ReviewState } from '../ports';
import { ReviewService } from '../service';
import { handleReviewRequest } from '../handlers';
import { NotionReviewRepository } from './notion';
import { TurnstileVerifier } from './turnstile';

interface ReviewBudget {
  day: number;
  submits: number;
  attempts?: number;
  reads: number;
  ips: Record<string, { hour: number; count: number }>;
}

class CloudflareReviewState implements ReviewState {
  private readonly storage: DurableObjectStorage;
  private readonly secret: string;
  private readonly diagnostics: RequestDiagnostics;

  constructor(
    storage: DurableObjectStorage,
    secret: string,
    diagnostics: RequestDiagnostics,
  ) {
    this.storage = storage;
    this.secret = secret;
    this.diagnostics = diagnostics;
  }

  private async readBudget(): Promise<ReviewBudget | undefined> {
    try {
      return await this.storage.get<ReviewBudget>('budget');
    } catch (error) {
      this.diagnostics.error({
        event: 'reviews_storage_failed',
        operation: 'get',
        key: 'budget',
        reason: failureReason(error),
      });
      throw error;
    }
  }

  private async writeBudget(budget: ReviewBudget): Promise<void> {
    try {
      await this.storage.put('budget', budget);
    } catch (error) {
      this.diagnostics.error({
        event: 'reviews_storage_failed',
        operation: 'put',
        key: 'budget',
        reason: failureReason(error),
      });
      throw error;
    }
  }

  private async budget(now: number): Promise<ReviewBudget> {
    const day = Math.floor(now / 86400000);
    const current = await this.readBudget();
    return current?.day === day
      ? current
      : { day, submits: 0, reads: 0, ips: {} };
  }

  async reserveRead(now: number): Promise<boolean> {
    const budget = await this.budget(now);
    if (budget.reads >= 1440) {
      this.diagnostics.info({
        event: 'reviews_quota_rejected',
        quota: 'read_daily',
      });
      return false;
    }
    budget.reads++;
    await this.writeBudget(budget);
    return true;
  }

  async reserveVerifiedSubmission(now: number): Promise<boolean> {
    const budget = await this.budget(now);
    if (budget.submits >= 100) {
      this.diagnostics.info({
        event: 'reviews_quota_rejected',
        quota: 'submission_daily',
      });
      return false;
    }
    // Reserve before Notion so failed writes cannot cause unlimited provider calls.
    budget.submits++;
    await this.writeBudget(budget);
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
    if ((budget.attempts ?? 0) >= 1000 || bucket.count >= 3) {
      this.diagnostics.info({
        event: 'reviews_quota_rejected',
        quota:
          (budget.attempts ?? 0) >= 1000
            ? 'attempt_daily'
            : 'submission_hourly',
      });
      return false;
    }
    budget.attempts = (budget.attempts ?? 0) + 1;
    bucket.count++;
    budget.ips[hash] = bucket;
    // Persist reservations before any external request, including failures.
    await this.writeBudget(budget);
    return true;
  }
}

export class ReviewsStore {
  private readonly context: DurableObjectState;
  private readonly env: Environment;

  constructor(context: DurableObjectState, env: Environment) {
    this.context = context;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const diagnostics = new RequestDiagnostics(
      request.headers.get(REQUEST_ID_HEADER),
    );
    try {
      return await this.context.blockConcurrencyWhile(() => {
        // Each request owns its diagnostics; concurrent calls cannot mix IDs.
        const service = new ReviewService(
          new CloudflareReviewState(
            this.context.storage,
            this.env.IP_HASH_SECRET,
            diagnostics,
          ),
          new NotionReviewRepository(this.env, fetch, diagnostics),
          new TurnstileVerifier(this.env, fetch, diagnostics),
        );
        return handleReviewRequest(request, service, diagnostics);
      });
    } catch (error) {
      diagnostics.error({
        event: 'reviews_store_failed',
        reason: failureReason(error),
      });
      throw error;
    }
  }
}

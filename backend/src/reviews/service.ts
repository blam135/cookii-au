import type { ReviewResult, ReviewSubmission } from './model';
import type { ChallengeVerifier, ReviewRepository, ReviewState } from './ports';

export class ReviewService {
  private readonly state: ReviewState;
  private readonly repository: ReviewRepository;
  private readonly verifier: ChallengeVerifier;

  constructor(
    state: ReviewState,
    repository: ReviewRepository,
    verifier: ChallengeVerifier,
  ) {
    this.state = state;
    this.repository = repository;
    this.verifier = verifier;
  }

  async list(now = Date.now()): Promise<ReviewResult> {
    const cache = await this.state.getCache();
    if (cache && now < cache.expires)
      return { kind: 'success', reviews: cache.rows };
    if (!(await this.state.reserveRead(now)))
      return cache
        ? { kind: 'success', reviews: cache.rows }
        : { kind: 'rate-limited' };
    const rows = await this.repository.load();
    await this.state.setCache({ rows, expires: now + 60000 });
    return { kind: 'success', reviews: rows };
  }

  async submit(
    submission: ReviewSubmission,
    ip: string,
    now = Date.now(),
  ): Promise<ReviewResult> {
    if (!(await this.state.reserveSubmission(ip, now)))
      return { kind: 'rate-limited' };
    if (!(await this.verifier.verify(submission.verificationToken, ip)))
      return { kind: 'verification-failed' };
    const { verificationToken: _token, ...input } = submission;
    const rows = await this.repository.save(input);
    const cache = await this.state.getCache();
    if (cache)
      await this.state.setCache({
        ...cache,
        rows: [...rows, ...cache.rows].slice(0, 20),
      });
    return { kind: 'success', reviews: rows };
  }
}

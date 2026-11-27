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
    if (!(await this.state.reserveRead(now))) return { kind: 'rate-limited' };
    return { kind: 'success', reviews: await this.repository.load() };
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
    if (!(await this.state.reserveVerifiedSubmission(now)))
      return { kind: 'rate-limited' };
    const { verificationToken: _token, ...input } = submission;
    return { kind: 'success', reviews: await this.repository.save(input) };
  }
}

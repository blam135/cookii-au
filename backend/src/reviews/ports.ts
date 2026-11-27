import type { Review, ReviewInput } from './model';

export interface ReviewRepository {
  load(): Promise<Review[]>;
  save(input: ReviewInput): Promise<Review[]>;
}

export interface ChallengeVerifier {
  verify(token: string, ip: string): Promise<boolean>;
}

// Calls are coordinated inside the state adapter's serialized request boundary.
export interface ReviewState {
  reserveRead(now: number): Promise<boolean>;
  reserveVerifiedSubmission(now: number): Promise<boolean>;
  reserveSubmission(ip: string, now: number): Promise<boolean>;
}
